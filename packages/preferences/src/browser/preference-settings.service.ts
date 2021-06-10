import { Injectable, Autowired } from '@ali/common-di';
import { observable, action } from 'mobx';
import { PreferenceScope, PreferenceProvider, PreferenceSchemaProvider, IDisposable, addElement, getAvailableLanguages, PreferenceService, localize, replaceLocalizePlaceholder } from '@ali/ide-core-browser';
import { IPreferenceViewDesc, IPreferenceSettingsService, ISettingGroup, ISettingSection, PreferenceProviderProvider } from '@ali/ide-core-browser';
import { getIcon } from '@ali/ide-core-browser';
import { CommandService, getDebugLogger, isString } from '@ali/ide-core-common';
import { toPreferenceReadableName, PreferenceSettingId } from '../common';
import { IFileServiceClient } from '@ali/ide-file-service';
import { IRecycleListHandler } from '@ali/ide-components';
import { PREFERENCE_COMMANDS } from './preference-contribution';

@Injectable()
export class PreferenceSettingsService implements IPreferenceSettingsService {

  @Autowired(PreferenceService)
  protected readonly preferenceService: PreferenceService;

  @Autowired(PreferenceSchemaProvider)
  protected readonly schemaProvider: PreferenceSchemaProvider;

  @Autowired(PreferenceProviderProvider)
  protected readonly providerProvider: PreferenceProviderProvider;

  @Autowired(IFileServiceClient)
  protected readonly fileServiceClient: IFileServiceClient;

  @Autowired(CommandService)
  protected readonly commandService: CommandService;

  @observable
  public currentGroup: string = '';

  @observable
  public currentSearch: string = '';

  private currentScope: PreferenceScope;

  public setCurrentGroup(groupId: string) {
    if (this.settingsGroups.find((n) => n.id === groupId)) {
      this.currentGroup = groupId;
      return;
    }
    getDebugLogger('Preference').warn('PreferenceService#setCurrentGroup is called with an invalid groupId:', groupId);
  }

  private settingsGroups: ISettingGroup[] = [];

  private settingsSections: Map<string, ISettingSection[]> = new Map();

  private enumLabels: Map<string, { [key: string]: string }> = new Map();

  private cachedGroupSection: Map<string, ISettingSection[]> = new Map();

  private _listHandler: IRecycleListHandler;

  constructor() {
    this.setEnumLabels('general.language', new Proxy({}, {
      get: (target, key) => {
        return getAvailableLanguages().find((l) => l.languageId === key)!.localizedLanguageName;
      },
    }));
    this.setEnumLabels('files.eol', {
      '\n': 'LF',
      '\r\n': 'CRLF',
      'auto': 'auto',
    });
  }

  private isContainSearchValue(value: string, search: string) {
    return value.toLocaleLowerCase().indexOf(search.toLocaleLowerCase()) > -1;
  }

  private filterPreferences(preference: string | IPreferenceViewDesc, scope: PreferenceScope): boolean {
    return typeof preference !== 'string' && Array.isArray(preference.hiddenInScope) && preference.hiddenInScope.includes(scope);
  }

  @action
  private doSearch(value) {
    if (value) {
      this.currentSearch = value;
    } else {
      this.currentSearch = '';
    }
  }

  openJSON = (scope: PreferenceScope, preferenceId: string) => {
    // 根据节点信息打开 Settings.json 配置文件
    this.commandService.executeCommand(PREFERENCE_COMMANDS.OPEN_SOURCE_FILE.id, scope, preferenceId);
  }

  /**
   * 设置某个作用域下的配置值
   * @param key 配置Key
   * @param value 配置值
   * @param scope 作用域
   */
  async setPreference(key: string, value: any, scope: PreferenceScope) {
    await this.preferenceService.set(key, value, scope);
  }

  get listHandler() {
    return this._listHandler;
  }

  handleListHandler = (handler: any) => {
    this._listHandler = handler;
  }

  /**
   * 获取搜索条件下展示的设置面板配置组
   * @param scope 作用域
   * @param search 搜索值
   */
  getSettingGroups(scope: PreferenceScope, search?: string | undefined): ISettingGroup[] {
    this.currentScope = scope;
    const groups = this.settingsGroups.slice();
    return groups.filter((g) => this.getSections(g.id, scope, search).length > 0);
  }

  /**
   * 注册配置组
   * @param group 配置组
   */
  registerSettingGroup(group: ISettingGroup): IDisposable {
    const disposable = addElement(this.settingsGroups, group);
    return disposable;
  }

  /**
   * 在某个配置组下注册配置项
   * @param groupId 配置组ID
   * @param section 配置项内容
   */
  registerSettingSection(groupId: string, section: ISettingSection): IDisposable {
    if (!this.settingsSections.has(groupId)) {
      this.settingsSections.set(groupId, []);
    }
    this.cachedGroupSection.clear();
    const disposable = addElement(this.settingsSections.get(groupId)!, section);
    return disposable;
  }

  /**
   * 通过配置项ID获取配置项展示信息
   * @param preferenceId 配置项ID
   */
  getSectionByPreferenceId(preferenceId: string) {
    const groups = this.settingsSections.values();
    for (const sections of groups) {
      for (const section of sections) {
        for (const preference of section.preferences) {
          if (!isString(preference)) {
            if (preference.id === preferenceId) {
              return preference;
            }
          }
        }
      }
    }
  }

  /**
   * 获取特定作用域及搜索条件下的配置项
   * @param groupId 配置组ID
   * @param scope 作用域
   * @param search 搜索条件
   */
  getSections(groupId: string, scope: PreferenceScope, search?: string): ISettingSection[] {
    const key = [groupId, scope, search || ''].join('-');
    if (this.cachedGroupSection.has(key)) {
      return this.cachedGroupSection.get(key)!;
    }
    const res = (this.settingsSections.get(groupId) || []).filter((section) => {
      if (section.hiddenInScope && section.hiddenInScope.indexOf(scope) >= 0) {
        return false;
      } else {
        return true;
      }
    });

    const result: ISettingSection[] = [];

    res.forEach((section) => {
      if (section.preferences) {
        const sec = { ...section };
        sec.preferences = section.preferences
          .filter((pref) => {
            if (this.filterPreferences(pref, scope)) {
              return false;
            }
            if (!search) {
              return true;
            }

            const prefId = typeof pref === 'string' ? pref : pref.id;
            const schema = this.schemaProvider.getPreferenceProperty(prefId);
            const prefLabel = typeof pref === 'string' ? toPreferenceReadableName(pref) : localize(pref.localized);
            const description = schema && replaceLocalizePlaceholder(schema.description);
            return this.isContainSearchValue(prefId, search) || this.isContainSearchValue(prefLabel, search) || (description && this.isContainSearchValue(description, search));
          });
        if (sec.preferences.length > 0) {
          result.push(sec);
        }
      }
    });
    this.cachedGroupSection.set(key.toLocaleLowerCase(), result);
    return result;
  }

  /**
   * 获取某个配置名在特定作用域下的值
   * @param preferenceName 配置名
   * @param scope 作用域
   * @param inherited 是否继承低优先级的配置值
   */
  getPreference(preferenceName: string, scope: PreferenceScope, inherited: boolean = false): { value: any, effectingScope: PreferenceScope } {
    const { value } = this.preferenceService.resolve(preferenceName, undefined, undefined, undefined, scope) || { value: undefined, scope: PreferenceScope.Default };
    const { scope: effectingScope } = this.preferenceService.resolve(preferenceName) || { value: undefined, scope: PreferenceScope.Default };
    return {
      value,
      effectingScope: effectingScope || PreferenceScope.Default,
    };
  }

  /**
   * 获取某个配置名下存在的Enum枚举项
   * @param preferenceName 配置名
   */
  getEnumLabels(preferenceName: string): { [key: string]: string } {
    return this.enumLabels.get(preferenceName) || {};
  }

  /**
   * 设置某个配置名下的Enum枚举项
   * @param preferenceName 配置名
   * @param labels 枚举项
   */
  setEnumLabels(preferenceName: string, labels: { [key: string]: string }) {
    this.enumLabels.set(preferenceName, labels);
  }

  /**
   * 重置某个配置项在特定作用域下的值
   * @param preferenceName 配置名
   * @param scope 作用域
   */
  async reset(preferenceName: string, scope: PreferenceScope) {
    await this.preferenceService.set(preferenceName, undefined, scope);
  }

  /**
   * 获取特定作用域下的配置文件路径
   * @param scope 作用域
   */
  async getPreferenceUrl(scope: PreferenceScope) {
    const preferenceProvider: PreferenceProvider = this.providerProvider(scope);
    const resource = await preferenceProvider.resource;
    if (resource && resource.getFsPath) {
      return await resource.getFsPath();
    } else {
      return preferenceProvider.getConfigUri()?.toString();
    }
  }

  /**
   * 获取当前面板下对应的配置文件路径
   * @param scope 作用域
   */
  async getCurrentPreferenceUrl(scope?: PreferenceScope) {
    // 默认获取全局设置的URI
    const url = await this.getPreferenceUrl(scope || this.currentScope || PreferenceScope.User)!;
    if (!url) {
      return;
    }
    const exist = await this.fileServiceClient.access(url);
    if (!exist) {
      const fileStat = await this.fileServiceClient.createFile(url);
      if (fileStat) {
        await this.fileServiceClient.setContent(fileStat!, '{\n}');
      }
    }
    return url;
  }

  /**
   * 在设置面板下搜索配置
   * @param value 搜索值
   */
  search = (value: string) => {
    this.doSearch(value);
  }
}

export const defaultSettingGroup: ISettingGroup[] = [
  {
    id: PreferenceSettingId.General,
    title: '%settings.group.general%',
    iconClass: getIcon('setting'),
  },
  {
    id: PreferenceSettingId.Editor,
    title: '%settings.group.editor%',
    iconClass: getIcon('editor'),
  },
  {
    id: PreferenceSettingId.Terminal,
    title: '%settings.group.terminal%',
    iconClass: getIcon('terminal'),
  },
  {
    id: PreferenceSettingId.Feature,
    title: '%settings.group.feature%',
    iconClass: getIcon('file-text'),
  },
  {
    id: PreferenceSettingId.View,
    title: '%settings.group.view%',
    iconClass: getIcon('detail'),
  },
];

export const defaultSettingSections: {
  [key: string]: ISettingSection[],
} = {
  general: [
    {
      preferences: [
        { id: 'general.theme', localized: 'preference.general.theme' },
        { id: 'general.icon', localized: 'preference.general.icon' },
        { id: 'general.language', localized: 'preference.general.language', hiddenInScope: [PreferenceScope.Workspace] },
      ],
    },
  ],
  editor: [
    {
      preferences: [
        // 预览模式
        { id: 'editor.previewMode', localized: 'preference.editor.previewMode' },
        // 自动保存
        { id: 'editor.autoSave', localized: 'preference.editor.autoSave' },
        { id: 'editor.autoSaveDelay', localized: 'preference.editor.autoSaveDelay' },
        { id: 'editor.previewMode', localized: 'preference.editor.previewMode' },
        { id: 'workbench.refactoringChanges.showPreviewStrategy', localized: 'preference.workbench.refactoringChanges.showPreviewStrategy' },
        { id: 'workbench.list.openMode', localized: 'preference.workbench.list.openMode' },
        { id: 'editor.askIfDiff', localized: 'preference.editor.askIfDiff' },
        // 光标样式
        { id: 'editor.cursorStyle', localized: 'preference.editor.cursorStyle' },
        // 字体
        { id: 'editor.fontSize', localized: 'preference.editor.fontSize' },
        { id: 'editor.fontWeight', localized: 'preference.editor.fontWeight' },
        { id: 'editor.fontFamily', localized: 'preference.editor.fontFamily' },
        // 缩进
        { id: 'editor.detectIndentation', localized: 'preference.editor.detectIndentation' },
        { id: 'editor.tabSize', localized: 'preference.editor.tabSize' },
        { id: 'editor.insertSpaces', localized: 'preference.editor.insertSpace' },
        // 显示
        { id: 'editor.wordWrap', localized: 'preference.editor.wordWrap' },
        { id: 'editor.renderLineHighlight', localized: 'preference.editor.renderLineHighlight' },
        { id: 'editor.renderWhitespace', localized: 'preference.editor.renderWhitespace' },
        { id: 'editor.minimap', localized: 'preference.editor.minimap' },
        // 格式化
        { id: 'editor.preferredFormatter', localized: 'preference.editor.preferredFormatter' },
        { id: 'editor.formatOnSave', localized: 'preference.editor.formatOnSave' },
        { id: 'editor.formatOnSaveTimeout', localized: 'preference.editor.formatOnSaveTimeout' },
        { id: 'editor.formatOnPaste', localized: 'preference.editor.formatOnPaste' },
        // 智能提示
        { id: 'editor.quickSuggestionsDelay', localized: 'preference.editor.quickSuggestionsDelay' },
        // 文件
        // `forceReadOnly` 选项暂时不对用户暴露
        // {id: 'editor.forceReadOnly', localized: 'preference.editor.forceReadOnly'},

        { id: 'files.encoding', localized: 'preference.files.encoding.title' },
        { id: 'files.eol', localized: 'preference.files.eol' },
        { id: 'editor.readonlyFiles', localized: 'preference.editor.readonlyFiles' },
        { id: 'files.exclude', localized: 'preference.files.exclude.title' },
        { id: 'files.watcherExclude', localized: 'preference.files.watcherExclude.title' },
        { id: 'files.associations', localized: 'preference.files.associations.title' },
        { id: 'editor.maxTokenizationLineLength', localized: 'preference.editor.maxTokenizationLineLength' },
        { id: 'editor.largeFile', localized: 'preference.editor.largeFile' },
        // Diff 编辑器
        { id: 'diffEditor.renderSideBySide', localized: 'preference.diffEditor.renderSideBySide' },
        { id: 'diffEditor.ignoreTrimWhitespace', localized: 'preference.diffEditor.ignoreTrimWhitespace' },
      ],
    },
  ],
  terminal: [
    {
      preferences: [
        // 终端类型
        { id: 'terminal.type', localized: 'preference.terminal.type' },
        // 字体
        { id: 'terminal.fontFamily', localized: 'preference.terminal.fontFamily' },
        { id: 'terminal.fontSize', localized: 'preference.terminal.fontSize' },
        { id: 'terminal.fontWeight', localized: 'preference.terminal.fontWeight' },
        { id: 'terminal.lineHeight', localized: 'preference.terminal.lineHeight' },
        // 光标
        { id: 'terminal.cursorBlink', localized: 'preference.terminal.cursorBlink' },
        // 显示
        { id: 'terminal.scrollback', localized: 'preference.terminal.scrollback' },
        // 命令行参数
        { id: 'terminal.integrated.shellArgs.linux', localized: 'preference.terminal.integrated.shellArgs.linux' },
      ],
    },
  ],
  feature: [
    {
      preferences: [
        // 树/列表项
        { id: 'workbench.list.openMode', localized: 'preference.workbench.list.openMode.title' },
        { id: 'explorer.autoReveal', localized: 'preference.explorer.autoReveal' },
        // 搜索
        { id: 'search.exclude', localized: 'preference.search.exclude.title' },
        { id: 'files.exclude', localized: 'preference.files.exclude.title' },
        { id: 'files.watcherExclude', localized: 'preference.files.watcherExclude.title' },
        // 输出
        { id: 'output.maxChannelLine', localized: 'output.maxChannelLine' },
        { id: 'output.enableLogHighlight', localized: 'output.enableLogHighlight' },
        { id: 'output.enableSmartScroll', localized: 'output.enableSmartScroll' },
      ],
    },
  ],
  view: [
    {
      preferences: [
        // 资源管理器
        { id: 'explorer.fileTree.baseIndent', localized: 'preference.explorer.fileTree.baseIndent.title' },
        { id: 'explorer.fileTree.indent', localized: 'preference.explorer.fileTree.indent.title' },
        { id: 'explorer.compactFolders', localized: 'preference.explorer.compactFolders.title' },
        // 运行与调试
        { id: 'debug.toolbar.float', localized: 'preference.debug.toolbar.float.title' },
      ],
    },
  ],
};
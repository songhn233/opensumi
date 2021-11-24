import React from 'react';
import styles from './debug-configuration.module.less';
import cls from 'classnames';
import { useInjectable, localize, isElectronRenderer, URI } from '@opensumi/ide-core-browser';
import { DebugAction } from '../../components';
import { DebugConfigurationService } from './debug-configuration.service';
import { observer } from 'mobx-react-lite';
import { DebugToolbarView } from './debug-toolbar.view';
import { Select, Option } from '@opensumi/ide-components';
import { Select as NativeSelect } from '@opensumi/ide-core-browser/lib/components/select';
import { DEFAULT_ADD_CONFIGURATION_KEY, DEFAULT_NO_CONFIGURATION_KEY, DEFAULT_CONFIGURATION_INDEX_SEPARATOR, DEFAULT_CONFIGURATION_NAME_SEPARATOR } from '../../../common';

export const DebugConfigurationView = observer(() => {
  const {
    configurationOptions,
    toValue,
    currentValue,
    openConfiguration,
    addConfiguration,
    openDebugConsole,
    updateConfiguration,
    start,
    float,
    isMultiRootWorkspace,
    workspaceRoots,
  } = useInjectable<DebugConfigurationService>(DebugConfigurationService);
  const addConfigurationLabel = localize('debug.action.add.configuration');

  const setCurrentConfiguration = (event: React.ChangeEvent<HTMLSelectElement> | string) => {
    let value: React.ChangeEvent<HTMLSelectElement> | string;
    if (typeof event === 'object') {
      value = event.target.value;
    } else {
      value = event;
    }
    if (value.startsWith(DEFAULT_ADD_CONFIGURATION_KEY)) {
      const index = value.slice(DEFAULT_ADD_CONFIGURATION_KEY.length);
      if (index) {
        addConfiguration(workspaceRoots[index]);
      } else {
        addConfiguration(workspaceRoots[0]);
      }
    } else {
      const [name, workspaceAndIndex] = value.split(DEFAULT_CONFIGURATION_NAME_SEPARATOR);
      const [workspaceFolderUri, index] = workspaceAndIndex.split(DEFAULT_CONFIGURATION_INDEX_SEPARATOR);
      updateConfiguration(name, workspaceFolderUri, +index);
    }
  };

  const renderConfigurationOptions = (options) => {
    if (options && options.length) {
      return options.map((option, index) => {
        const label = isMultiRootWorkspace ? `${option.configuration.name} (${new URI(option.workspaceFolderUri).displayName})` : option.configuration.name;
        return isElectronRenderer() ?
          <option key={index} value={toValue(option)} label={label}>{label}</option> :
          <Option key={index} value={toValue(option)} label={label}>{label}</Option>;
      });
    } else {
      return isElectronRenderer() ?
        [<option value={DEFAULT_NO_CONFIGURATION_KEY} key={DEFAULT_NO_CONFIGURATION_KEY} label={localize('debug.action.no.configuration')}>{localize('debug.action.no.configuration')}</option>] :
        [<Option value={DEFAULT_NO_CONFIGURATION_KEY} key={DEFAULT_NO_CONFIGURATION_KEY} label={localize('debug.action.no.configuration')}>{localize('debug.action.no.configuration')}</Option>];
    }
  };

  const renderAddConfigurationOptions = () => {
    if (isMultiRootWorkspace) {
      let longName: string = addConfigurationLabel;
      const addonOptions = workspaceRoots.map((root, index) => {
        const label = `${addConfigurationLabel} (${new URI(root).displayName})`;
        if (longName.length < label.length) {
          longName = label;
        }
        return isElectronRenderer() ?
          <option value={`${DEFAULT_ADD_CONFIGURATION_KEY}${index}`} key={`${DEFAULT_ADD_CONFIGURATION_KEY}${index}`} label={label}>{label}</option> :
          <Option value={`${DEFAULT_ADD_CONFIGURATION_KEY}${index}`} key={`${DEFAULT_ADD_CONFIGURATION_KEY}${index}`} label={label}>{label}</Option>;
      });
      const disabledOption = isElectronRenderer() ?
        [<option disabled key={'--'} value={longName!.replace(/./g, '-')}>{longName!.replace(/./g, '-')}</option>] :
        [<Option disabled key={'--'} value={longName!.replace(/./g, '-')}>{longName!.replace(/./g, '-')}</Option>];
      return disabledOption.concat(addonOptions);
    } else {
      const label = addConfigurationLabel;
      return isElectronRenderer() ?
        [
          <option disabled key={'--'} value={label!.replace(/./g, '-')}>{label!.replace(/./g, '-')}</option>,
          <option value={DEFAULT_ADD_CONFIGURATION_KEY} key={DEFAULT_ADD_CONFIGURATION_KEY} label={label}>{label}</option>,
        ] :
        [
          <Option disabled key={'--'} value={label!.replace(/./g, '-')}>{label!.replace(/./g, '-')}</Option>,
          <Option value={DEFAULT_ADD_CONFIGURATION_KEY} key={DEFAULT_ADD_CONFIGURATION_KEY} label={label}>{label}</Option>,
        ];
    }
  };

  const renderConfigurationSelect = () => {
    if (isElectronRenderer()) {
      return (<NativeSelect value={currentValue} onChange={setCurrentConfiguration} className={cls(styles.debug_selection, styles.special_radius)}>
        { renderConfigurationOptions(configurationOptions)}
        { renderAddConfigurationOptions()}
      </NativeSelect>);
    }

    return (<Select value={currentValue} onChange={setCurrentConfiguration} className={cls(styles.debug_selection, styles.special_radius)}>
      { renderConfigurationOptions(configurationOptions)}
      { renderAddConfigurationOptions()}

    </Select>);
  };

  return <div>
    <div className={styles.debug_configuration_toolbar}>
      {renderConfigurationSelect()}
      <div className={styles.kt_debug_actions}>
        <DebugAction id='debug.action.start' icon={'start'} label={localize('debug.action.start')} run={start}></DebugAction>
        <DebugAction id='debug.action.open.configuration' icon={'setting'} label={localize('debug.action.open.configuration')} run={openConfiguration}></DebugAction>
        <DebugAction id='debug.action.debug.console' icon={'terminal'} label={localize('debug.action.debug.console')} run={openDebugConsole}></DebugAction>
      </div>
    </div>
    {!float && <DebugToolbarView float={false} />}
  </div>;
});

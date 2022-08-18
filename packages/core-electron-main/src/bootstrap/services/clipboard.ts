import { Injectable } from '@opensumi/di';
import { IClipboardService } from '@opensumi/ide-core-common';
import { URI } from '@opensumi/ide-core-common';

export const PASTE_FILE_LOCAL_TOKEN = 'paste-uri-list';
export { IClipboardService } from '@opensumi/ide-core-common';

@Injectable()
export class ElectronClipboardService implements IClipboardService {
  async writeText(): Promise<void> {
    return;
  }
  async readText(): Promise<string> {
    return '';
  }
  async writeResources(resources: URI[], field = PASTE_FILE_LOCAL_TOKEN): Promise<void> {
    return;
  }
  async readResources(field = PASTE_FILE_LOCAL_TOKEN): Promise<URI[]> {
    return [];
  }
}

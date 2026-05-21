import { Injectable, inject } from '@angular/core';

import { ElectronService } from '../electron/electron.service';

export interface PickedFile {
  readonly filePath: string;
  readonly fileName: string;
}

/**
 * Opens a native file picker in Electron; returns null when unavailable or cancelled.
 */
@Injectable({ providedIn: 'root' })
export class RequestFilePickerService {
  private readonly electron = inject(ElectronService);

  async pickFile(options?: {
    readonly filters?: readonly { readonly name: string; readonly extensions: readonly string[] }[];
  }): Promise<PickedFile | null> {
    const bridge = this.electron.bridge();
    if (!bridge?.shell?.pickFile) {
      return null;
    }
    return bridge.shell.pickFile(options);
  }
}

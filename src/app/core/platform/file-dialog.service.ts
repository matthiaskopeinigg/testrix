import { Injectable, inject } from '@angular/core';

import { ElectronService } from '@app/core/electron/electron.service';

export interface PickedFileContent {
  readonly filePath: string;
  readonly fileName: string;
  readonly content: string;
}

/**
 * Thin wrapper around Electron shell file dialogs and reads.
 */
@Injectable({ providedIn: 'root' })
export class FileDialogService {
  private readonly electron = inject(ElectronService);

  async pickFile(extensions: string[] = ['json']): Promise<PickedFileContent | null> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return null;
    }
    const picked = await bridge.shell.pickFile({
      filters: [{ name: 'Files', extensions }],
    });
    if (!picked) {
      return null;
    }
    return bridge.shell.readTextFile(picked.filePath);
  }

  async pickFiles(extensions: string[] = ['json', 'yaml', 'yml']): Promise<readonly PickedFileContent[] | null> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return null;
    }
    const result = await bridge.shell.pickFiles({ extensions });
    return result?.files ?? null;
  }

  async readImportFolder(options?: {
    extensions?: string[];
    maxFiles?: number;
    recursive?: boolean;
  }): Promise<readonly PickedFileContent[] | null> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return null;
    }
    const result = await bridge.shell.readImportFolder(options);
    return result?.files ?? null;
  }

  async saveJson(content: string, defaultPath = 'testrix-export.json'): Promise<string | null> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return null;
    }
    const saved = await bridge.shell.saveFile({
      content,
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    return saved?.filePath ?? null;
  }
}

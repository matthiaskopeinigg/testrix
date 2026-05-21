import { BrowserWindow, dialog, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';

import { ShellChannels } from '../channels/shell.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';

export interface PickFileFilter {
  readonly name: string;
  readonly extensions: readonly string[];
}

export interface PickFileOptions {
  readonly filters?: readonly PickFileFilter[];
}

export interface PickFileResult {
  readonly filePath: string;
  readonly fileName: string;
}

export function registerShellHandlers(ipc: Pick<IpcMain, 'handle'>): void {
  ipc.handle(
    ShellChannels.pickFile,
    wrapInvokeHandler(
      ShellChannels.pickFile,
      async (event: IpcMainInvokeEvent, options: unknown): Promise<PickFileResult | null> => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const filters =
          typeof options === 'object' &&
          options !== null &&
          Array.isArray((options as PickFileOptions).filters)
            ? (options as PickFileOptions).filters?.map((f) => ({
                name: f.name,
                extensions: [...f.extensions],
              }))
            : undefined;

        const dialogOptions = {
          properties: ['openFile'] as Array<'openFile'>,
          filters,
        };
        const result = parent
          ? await dialog.showOpenDialog(parent, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }

        const filePath = result.filePaths[0];
        if (!filePath) {
          return null;
        }

        return {
          filePath,
          fileName: path.basename(filePath),
        };
      },
    ),
  );
}

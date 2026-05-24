import { BrowserWindow, dialog, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs/promises';
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

export interface SaveFileOptions {
  readonly content: string;
  readonly defaultPath?: string;
  readonly filters?: readonly PickFileFilter[];
  /** When `base64`, content is decoded before writing (for binary exports). */
  readonly encoding?: 'utf8' | 'base64';
}

export interface SaveFileResult {
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

  ipc.handle(
    ShellChannels.saveFile,
    wrapInvokeHandler(
      ShellChannels.saveFile,
      async (event: IpcMainInvokeEvent, options: unknown): Promise<SaveFileResult | null> => {
        if (typeof options !== 'object' || options === null) {
          return null;
        }
        const payload = options as SaveFileOptions;
        if (typeof payload.content !== 'string') {
          return null;
        }

        const parent = BrowserWindow.fromWebContents(event.sender);
        const filters = Array.isArray(payload.filters)
          ? payload.filters.map((f) => ({
              name: f.name,
              extensions: [...f.extensions],
            }))
          : undefined;

        const dialogOptions = {
          defaultPath: payload.defaultPath,
          filters,
        };
        const result = parent
          ? await dialog.showSaveDialog(parent, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions);

        if (result.canceled || !result.filePath) {
          return null;
        }

        await fs.writeFile(
          result.filePath,
          payload.encoding === 'base64' ? Buffer.from(payload.content, 'base64') : payload.content,
          payload.encoding === 'base64' ? undefined : 'utf8',
        );

        return {
          filePath: result.filePath,
          fileName: path.basename(result.filePath),
        };
      },
    ),
  );
}

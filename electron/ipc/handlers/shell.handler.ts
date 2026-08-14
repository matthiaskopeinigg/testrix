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

export interface PickedFileContent {
  readonly filePath: string;
  readonly fileName: string;
  readonly content: string;
}

export interface PickFilesResult {
  readonly files: readonly PickedFileContent[];
}

export interface ReadImportFolderOptions {
  readonly extensions?: readonly string[];
  readonly maxFiles?: number;
  readonly recursive?: boolean;
  readonly maxDepth?: number;
  readonly ignoreDirNames?: readonly string[];
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

const DEFAULT_IMPORT_EXTENSIONS = ['json', 'yaml', 'yml'] as const;
const DEFAULT_IMPORT_IGNORE_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.angular']);

function normalizeExtensions(extensions?: readonly string[]): string[] {
  const source = extensions?.length ? extensions : DEFAULT_IMPORT_EXTENSIONS;
  return source.map((e) => e.toLowerCase().replace(/^\./, ''));
}

function matchesExtension(filePath: string, extensions: readonly string[]): boolean {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
  return extensions.includes(ext);
}

async function readTextFileEntry(filePath: string): Promise<PickedFileContent> {
  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    fileName: path.basename(filePath),
    content,
  };
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
    ShellChannels.pickFiles,
    wrapInvokeHandler(
      ShellChannels.pickFiles,
      async (event: IpcMainInvokeEvent, options: unknown): Promise<PickFilesResult | null> => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const extensions =
          typeof options === 'object' &&
          options !== null &&
          Array.isArray((options as { extensions?: unknown }).extensions)
            ? normalizeExtensions((options as { extensions?: readonly string[] }).extensions)
            : [...DEFAULT_IMPORT_EXTENSIONS];

        const dialogOptions = {
          properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
          filters: [{ name: 'Import files', extensions }],
        };
        const result = parent
          ? await dialog.showOpenDialog(parent, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }

        const files: PickedFileContent[] = [];
        for (const filePath of result.filePaths) {
          files.push(await readTextFileEntry(filePath));
        }
        return { files };
      },
    ),
  );

  ipc.handle(
    ShellChannels.readTextFile,
    wrapInvokeHandler(
      ShellChannels.readTextFile,
      async (_event: IpcMainInvokeEvent, filePath: unknown): Promise<PickedFileContent | null> => {
        if (typeof filePath !== 'string' || filePath.trim().length === 0) {
          return null;
        }
        return readTextFileEntry(filePath);
      },
    ),
  );

  ipc.handle(
    ShellChannels.readImportFolder,
    wrapInvokeHandler(
      ShellChannels.readImportFolder,
      async (event: IpcMainInvokeEvent, options: unknown): Promise<PickFilesResult | null> => {
        const parent = BrowserWindow.fromWebContents(event.sender);
        const result = parent
          ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
          : await dialog.showOpenDialog({ properties: ['openDirectory'] });

        if (result.canceled || !result.filePaths[0]) {
          return null;
        }

        const rootDir = result.filePaths[0];
        const opts = typeof options === 'object' && options !== null ? (options as ReadImportFolderOptions) : {};
        const extensions = normalizeExtensions(opts.extensions);
        const maxFiles = typeof opts.maxFiles === 'number' && opts.maxFiles > 0 ? opts.maxFiles : 500;
        const recursive = Boolean(opts.recursive);
        const maxDepth = typeof opts.maxDepth === 'number' && opts.maxDepth >= 0 ? opts.maxDepth : 2;
        const ignore = new Set(
          Array.isArray(opts.ignoreDirNames) && opts.ignoreDirNames.length
            ? opts.ignoreDirNames
            : [...DEFAULT_IMPORT_IGNORE_DIR_NAMES],
        );

        const collected: string[] = [];

        async function walk(dir: string, currentDepth: number): Promise<void> {
          if (collected.length >= maxFiles) {
            return;
          }
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const ent of entries) {
            if (collected.length >= maxFiles) {
              return;
            }
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
              if (recursive && currentDepth < maxDepth && !ignore.has(ent.name)) {
                await walk(full, currentDepth + 1);
              }
            } else if (ent.isFile() && matchesExtension(full, extensions)) {
              collected.push(full);
            }
          }
        }

        await walk(rootDir, 0);
        const files: PickedFileContent[] = [];
        for (const filePath of collected) {
          files.push(await readTextFileEntry(filePath));
        }
        return { files };
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

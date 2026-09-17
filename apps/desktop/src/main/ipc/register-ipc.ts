import type { App, BrowserWindow, IpcMain, OpenDialogOptions } from 'electron';
import { dialog, nativeTheme } from 'electron';

import { certFileKindSchema, chooseFileKindSchema, collectDatabaseSecrets, collectEnvironmentSecrets, databaseErrorContext, flattenDatabaseConnections, formatDatabaseError, IpcChannels, shouldHoldSqlSession, type ChooseFileKind, type DatabaseConnection } from '@testrix/contracts';
import { appLogger, type AppReadyCoordinator } from '@testrix/electron-core';

import type { ConfigStore } from '../services/config.service';
import type { DatabaseHost } from '../services/database/database-host.service';

export interface IpcContext {
  readonly app: App;
  readonly getMainWindow: () => BrowserWindow | null;
  readonly store: ConfigStore;
  readonly database: DatabaseHost;
  readonly coordinator: AppReadyCoordinator;
}

export function applyLogger(store: ConfigStore): void {
  appLogger.configure({
    level: store.settings.logLevel,
    toFile: store.settings.logToFile,
    filePath: store.logFilePath(),
    maxFileBytes: store.settings.logFileMaxMb * 1024 * 1024,
    secrets: [
      ...collectEnvironmentSecrets(store.environments),
      ...collectDatabaseSecrets(store.databases),
    ],
  });
}

export function registerIpc(ipcMain: IpcMain, ctx: IpcContext): void {
  ipcMain.handle(IpcChannels.appGetVersion, () => ctx.app.getVersion());
  ipcMain.handle(IpcChannels.appGetPlatform, () => process.platform);
  ipcMain.handle(IpcChannels.appNotifyReady, () => {
    ctx.coordinator.markAngularReady();
  });
  ipcMain.handle(IpcChannels.appReload, () => {
    ctx.getMainWindow()?.webContents.reload();
  });
  ipcMain.handle(IpcChannels.windowMinimize, () => ctx.getMainWindow()?.minimize());
  ipcMain.handle(IpcChannels.windowMaximize, () => {
    const win = ctx.getMainWindow();
    if (!win) {
      return;
    }
    if (win.isMaximized()) {
      win.unmaximize();
      return;
    }
    win.maximize();
  });
  ipcMain.handle(IpcChannels.windowClose, () => ctx.getMainWindow()?.close());
  ipcMain.handle(IpcChannels.windowIsMaximized, () => ctx.getMainWindow()?.isMaximized() ?? false);
  ipcMain.handle(IpcChannels.windowSetMovable, (_e, movable: boolean) => {
    ctx.getMainWindow()?.setMovable(Boolean(movable));
  });
  ipcMain.handle(IpcChannels.themeGet, () => ctx.store.snapshot());
  ipcMain.handle(IpcChannels.themeSet, async (_e, preference) => {
    const snapshot = ctx.store.applyTheme(preference);
    await ctx.store.patchSettings({ theme: preference });
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return snapshot;
  });
  ipcMain.handle(IpcChannels.settingsGet, () => ctx.store.settings);
  ipcMain.handle(IpcChannels.settingsSet, async (_e, patch) => {
    const next = await ctx.store.patchSettings(patch);
    applyLogger(ctx.store);
    if (patch.theme) {
      const snapshot = ctx.store.applyTheme(patch.theme);
      ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    }
    return next;
  });
  ipcMain.handle(IpcChannels.settingsReset, async (_e, scope) => {
    const next = await ctx.store.resetSettings(scope);
    applyLogger(ctx.store);
    const snapshot = ctx.store.applyTheme(next.theme);
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return next;
  });
  ipcMain.handle(IpcChannels.sessionGet, () => ctx.store.session);
  ipcMain.handle(IpcChannels.sessionSet, async (_e, patch) => ctx.store.patchSession(patch));
  ipcMain.handle(IpcChannels.environmentsGet, () => ctx.store.environments);
  ipcMain.handle(IpcChannels.environmentsSet, async (_e, patch) => {
    const next = await ctx.store.patchEnvironments(patch);
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.handle(IpcChannels.collectionsGet, () => ctx.store.collections);
  ipcMain.handle(IpcChannels.collectionsSet, async (_e, patch) =>
    ctx.store.patchCollections(patch),
  );
  ipcMain.handle(IpcChannels.databasesGet, () => ctx.store.databases);
  ipcMain.handle(IpcChannels.databasesSet, async (_e, patch) => ctx.store.patchDatabases(patch));
  ipcMain.handle(IpcChannels.queriesGet, () => ctx.store.queries);
  ipcMain.handle(IpcChannels.queriesSet, async (_e, patch) => ctx.store.patchQueries(patch));
  ipcMain.handle(IpcChannels.databaseTest, async (_e, connection) =>
    invokeDatabase(() => ctx.database.test(connection), connection),
  );
  ipcMain.handle(IpcChannels.databaseIntrospect, async (_e, payload) =>
    invokeDatabase(() => ctx.database.introspect(payload), payload?.connection),
  );
  ipcMain.handle(IpcChannels.databaseQuery, async (_e, payload) =>
    invokeDatabase(() => ctx.database.query(payload), payload?.connection),
  );
  ipcMain.handle(IpcChannels.databaseExplain, async (_e, payload) =>
    invokeDatabase(() => ctx.database.explain(payload), payload?.connection),
  );
  ipcMain.handle(IpcChannels.databaseDisconnect, async (_e, connectionId: string) =>
    invokeDatabase(() => ctx.database.disconnect(connectionId)),
  );
  ipcMain.handle(IpcChannels.databaseStatuses, () => ctx.database.statusesSnapshot());
  ipcMain.handle(IpcChannels.databaseSessionQuery, async (_e, payload) => {
    const hold =
      payload?.hold === true || shouldHoldSqlSession(payload?.query ?? '', payload?.connection?.type);
    return invokeDatabase(() => ctx.database.sessionQuery(payload, hold), payload?.connection);
  });
  ipcMain.handle(IpcChannels.databaseSessionCommit, async (_e, tabId: string) => {
    const connection = connectionForTab(ctx, tabId);
    return invokeDatabase(() => ctx.database.sessionCommit(tabId, connection), connection);
  });
  ipcMain.handle(IpcChannels.databaseSessionRollback, async (_e, tabId: string) => {
    const connection = connectionForTab(ctx, tabId);
    return invokeDatabase(() => ctx.database.sessionRollback(tabId, connection), connection);
  });
  ipcMain.handle(IpcChannels.databaseSessionClose, async (_e, tabId: string) => {
    const connection = connectionForTab(ctx, tabId);
    await invokeDatabase(() => ctx.database.sessionClose(tabId, connection), connection);
  });
  ipcMain.handle(IpcChannels.databaseWarmBoot, async () => {
    if (!ctx.store.settings.database.connectOnStartup)
      return;
    await invokeDatabase(() => ctx.database.warmBoot(flattenDatabaseConnections(ctx.store.databases.nodes)));
  });
  ipcMain.handle(IpcChannels.workspacesGet, () => ctx.store.workspaces);
  ipcMain.handle(IpcChannels.workspacesSwitch, async (_e, id: string) => {
    const next = await ctx.store.switchWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.handle(IpcChannels.workspacesCreate, async (_e, name: string) => {
    const next = await ctx.store.createWorkspace(typeof name === 'string' ? name : '');
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.handle(IpcChannels.workspacesRename, async (_e, id: string, name: string) =>
    ctx.store.renameWorkspace(id, typeof name === 'string' ? name : ''),
  );
  ipcMain.handle(IpcChannels.workspacesDuplicate, async (_e, id: string) => {
    const next = await ctx.store.duplicateWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.handle(IpcChannels.workspacesDelete, async (_e, id: string) => {
    const next = await ctx.store.deleteWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.handle(IpcChannels.logsRecent, () => appLogger.recentLines());
  ipcMain.handle(IpcChannels.configPaths, () => ctx.store.paths());
  ipcMain.handle(IpcChannels.configReveal, async (_e, target) => {
    await ctx.store.reveal(target);
  });
  ipcMain.handle(IpcChannels.configChooseFolder, async () => {
    const win = ctx.getMainWindow();
    const options: OpenDialogOptions = {
      title: 'Choose config folder',
      defaultPath: ctx.store.folder(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
      return null;
    const paths = await ctx.store.setFolder(result.filePaths[0]);
    applyLogger(ctx.store);
    const snapshot = ctx.store.applyTheme(ctx.store.settings.theme);
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return paths;
  });
  ipcMain.handle(IpcChannels.configChooseLogsFolder, async () => {
    const win = ctx.getMainWindow();
    const options: OpenDialogOptions = {
      title: 'Choose logs folder',
      defaultPath: ctx.store.logsFolder(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
      return null;
    await ctx.store.patchSettings({ logsFolder: result.filePaths[0] });
    applyLogger(ctx.store);
    return ctx.store.paths();
  });
  ipcMain.handle(IpcChannels.configChooseConfigsFolder, async () => {
    const win = ctx.getMainWindow();
    const options: OpenDialogOptions = {
      title: 'Choose configs folder',
      defaultPath: ctx.store.configsPath(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
      return null;
    return ctx.store.setConfigsFolder(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.configChooseFile, async (_e, kind: unknown) => {
    const parsed = chooseFileKindSchema.safeParse(kind);
    if (!parsed.success)
      return null;
    const win = ctx.getMainWindow();
    const options = chooseFileDialogOptions(parsed.data);
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
      return null;
    return result.filePaths[0];
  });

  nativeTheme.on('updated', () => {
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, ctx.store.snapshot());
  });

  const win = ctx.getMainWindow();
  win?.on('maximize', () => win.webContents.send(IpcChannels.windowMaximizedChanged, true));
  win?.on('unmaximize', () => win.webContents.send(IpcChannels.windowMaximizedChanged, false));
}

async function invokeDatabase<T>(
  run: () => Promise<T>,
  connection?: Pick<DatabaseConnection, 'type' | 'host' | 'port' | 'database' | 'filePath'>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(formatDatabaseError(error, connection ? databaseErrorContext(connection) : undefined));
  }
}

function connectionForTab(ctx: IpcContext, tabId: string) {
  const connectionId = ctx.database.sessionConnectionId(tabId);
  const match = flattenDatabaseConnections(ctx.store.databases.nodes).find((item) => item.id === connectionId);
  return match ?? ({ id: connectionId ?? tabId, type: 'sqlite', name: 'session', kind: 'connection', host: '', port: 0, connectOnBoot: false } as const);
}

function chooseFileDialogOptions(kind: ChooseFileKind): OpenDialogOptions {
  if (kind === 'sqlite') {
    return {
      title: 'Choose SQLite database',
      properties: ['openFile', 'createDirectory'],
      filters: [
        { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
  }
  if (kind === 'oracle-client') {
    return {
      title: 'Choose Oracle Instant Client folder',
      properties: ['openDirectory'],
    };
  }
  return certFileDialogOptions(kind);
}

function certFileDialogOptions(kind: 'ca' | 'cert' | 'key'): OpenDialogOptions {
  if (kind === 'ca') {
    return {
      title: 'Choose extra CA certificate',
      properties: ['openFile'],
      filters: [
        { name: 'Certificates', extensions: ['pem', 'crt', 'cer', 'cert'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
  }
  if (kind === 'key') {
    return {
      title: 'Choose private key',
      properties: ['openFile'],
      filters: [
        { name: 'Private keys', extensions: ['pem', 'key'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
  }
  return {
    title: 'Choose client certificate',
    properties: ['openFile'],
    filters: [
      { name: 'Certificates', extensions: ['pem', 'crt', 'cer', 'pfx', 'p12'] },
      { name: 'All files', extensions: ['*'] },
    ],
  };
}

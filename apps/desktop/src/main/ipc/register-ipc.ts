import { BrowserWindow, dialog, nativeTheme, type App, type IpcMain, type OpenDialogOptions } from 'electron';
import { z } from 'zod';

import {
  chooseFileKindSchema,
  collabAddWorkspacesSchema,
  collabBranchSchema,
  collabConnectSchema,
  collabUpdateCredentialSchema,
  collabIdentitySchema,
  collabLockProgressSchema,
  collabLockRequestSchema,
  collabPresenceModeSchema,
  collabPublishWorkspaceSchema,
  collabRemoveFromRepoSchema,
  collabResolveSchema,
  collabRunPublishSchema,
  collectDatabaseSecrets,
  collectEnvironmentSecrets,
  configRevealTargetSchema,
  databaseConnectionSchema,
  databaseErrorContext,
  databaseIntrospectRequestSchema,
  databaseQueryRequestSchema,
  databaseSessionQueryRequestSchema,
  deviceStartEmulatorSchema,
  flattenDatabaseConnections,
  flowManualPromptReplySchema,
  flowPickDeviceSelectorSchema,
  flowPickSelectorSchema,
  flowRunDraftSchema,
  formatDatabaseError,
  httpExecuteRequestSchema,
  importFileNameSchema,
  IpcChannels,
  ipcFilePatchSchema,
  ipcIdSchema,
  ipcOptionalIdSchema,
  oauthClientConfigSchema,
  regressionRunOptionsSchema,
  settingsResetScopeSchema,
  shouldHoldSqlSession,
  themePreferenceSchema,
  updatePrefsPatchSchema,
  websocketConnectRequestSchema,
  websocketSendRequestSchema,
  workspaceImportApplyRequestSchema,
  workspaceNameSchema,
  workspaceOrderSchema,
  workspacePackSelectionSchema,
  type ChooseFileKind,
  type CollectionsFile,
  type CookiesFile,
  type DatabaseConnection,
  type DatabasesFile,
  type EmulatorFile,
  type EnvironmentsFile,
  type FlowsFile,
  type FlowTemplatesFile,
  type HistoryFile,
  type InterceptFile,
  type ListenersFile,
  type LoadFile,
  type MocksFile,
  type PlantumlFile,
  type QueriesFile,
  type RegressionsFile,
  type SessionFile,
  type UserSettings,
} from '@testrix/contracts';
import { appLogger, type AppReadyCoordinator } from '@testrix/electron-core';

import type { ConfigStore } from '../services/config.service';
import type { DatabaseHost } from '../services/database/database-host.service';
import type { HttpHost } from '../services/http-host.service';
import type { TestingRuntime } from '../services/testing/testing-runtime';
import type { WebsocketHost } from '../services/websocket-host.service';
import type { WorkspacePackHost } from '../services/workspace-pack-host.service';
import type { CollabHost } from '../services/collab/collab-host.service';
import type { UpdateHost } from '../services/update/update-host.service';
import { createIpcHandle, isTrustedSenderUrl } from './ipc-handle';

export interface IpcContext {
  readonly app: App;
  readonly getMainWindow: () => BrowserWindow | null;
  readonly openWorkbenchWindow?: () => BrowserWindow;
  readonly store: ConfigStore;
  readonly database: DatabaseHost;
  readonly http: HttpHost;
  readonly websocket: WebsocketHost;
  readonly testing: TestingRuntime;
  readonly coordinator: AppReadyCoordinator;
  readonly workspacePack: WorkspacePackHost;
  readonly collab: CollabHost;
  readonly updates: UpdateHost;
}

/** `Partial<File>` patch: a plain object here; the store's own parser checks the merged file. */
function patch<T>(): z.ZodType<Partial<Omit<T, 'schemaVersion'>>> {
  return ipcFilePatchSchema as unknown as z.ZodType<Partial<Omit<T, 'schemaVersion'>>>;
}

const NO_ARGS = [] as const;
const pathArg = z.string().min(1).max(4096);
const httpRequestArg = httpExecuteRequestSchema.extend({ verifyTls: z.boolean().optional() });
const websocketConnectArg = websocketConnectRequestSchema.extend({ verifyTls: z.boolean().optional() });

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
  const handle = createIpcHandle(ipcMain);
  const windowFor = (event: Electron.IpcMainInvokeEvent) =>
    BrowserWindow.fromWebContents(event.sender) ?? ctx.getMainWindow();

  handle(IpcChannels.appGetVersion, NO_ARGS, () => ctx.app.getVersion());
  handle(IpcChannels.appGetPlatform, NO_ARGS, () => process.platform);
  handle(IpcChannels.appNotifyReady, NO_ARGS, () => {
    ctx.coordinator.markAngularReady();
  });
  handle(IpcChannels.appReload, NO_ARGS, () => {
    ctx.getMainWindow()?.webContents.reload();
  });
  handle(IpcChannels.windowMinimize, NO_ARGS, (event) => {
    const win = windowFor(event);
    if (!win || win.isDestroyed())
      return;
    win.setMinimizable(true);
    // After mouse-up: minimize() during pointerdown is undone on Windows.
    deferWindowAction(win, (next) => next.minimize());
  });
  handle(IpcChannels.windowMaximize, NO_ARGS, (event) => {
    const win = windowFor(event);
    if (!win || win.isDestroyed())
      return;
    win.setMaximizable(true);
    deferWindowAction(win, (next) => {
      if (next.isMaximized()) {
        next.unmaximize();
        return;
      }
      next.maximize();
    });
  });
  handle(IpcChannels.windowClose, NO_ARGS, (event) => {
    const win = windowFor(event);
    if (!win || win.isDestroyed())
      return;
    // Prefer close() so before-quit cleanup runs; destroy() as fallback.
    win.close();
  });
  handle(IpcChannels.windowIsMaximized, NO_ARGS, (event) => windowFor(event)?.isMaximized() ?? false);
  handle(IpcChannels.windowOpenWorkbench, NO_ARGS, () => {
    ctx.openWorkbenchWindow?.();
  });
  handle(IpcChannels.sessionGet, NO_ARGS, (event) => ctx.store.getSessionForWindow(event.sender.id));
  handle(IpcChannels.sessionSet, [patch<SessionFile>()], (event, next) =>
    ctx.store.patchSessionForWindow(event.sender.id, next),
  );
  handle(IpcChannels.windowSetMovable, [z.boolean()], (_e, movable) => {
    const win = ctx.getMainWindow();
    if (!win || win.isDestroyed())
      return;
    // Never lock the main window: setMovable(false) breaks Windows frameless chrome.
    if (!movable)
      return;
    win.setMovable(true);
  });
  handle(IpcChannels.themeGet, NO_ARGS, () => ctx.store.snapshot());
  handle(IpcChannels.themeSet, [themePreferenceSchema], async (_e, preference) => {
    const snapshot = ctx.store.applyTheme(preference);
    await ctx.store.patchSettings({ theme: preference });
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return snapshot;
  });
  handle(IpcChannels.settingsGet, NO_ARGS, () => ctx.store.settings);
  handle(IpcChannels.settingsSet, [patch<UserSettings>()], async (_e, settingsPatch) => {
    const next = await ctx.store.patchSettings(settingsPatch);
    applyLogger(ctx.store);
    const theme = themePreferenceSchema.safeParse(settingsPatch.theme);
    if (theme.success) {
      const snapshot = ctx.store.applyTheme(theme.data);
      ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    }
    return next;
  });
  handle(IpcChannels.settingsReset, [settingsResetScopeSchema], async (_e, scope) => {
    if (scope === 'android' || scope === 'all')
      await ctx.testing.android.deactivate();
    const next = await ctx.store.resetSettings(scope);
    applyLogger(ctx.store);
    const snapshot = ctx.store.applyTheme(next.theme);
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return next;
  });
  handle(IpcChannels.environmentsGet, NO_ARGS, () => ctx.store.environments);
  handle(IpcChannels.environmentsSet, [patch<EnvironmentsFile>()], async (_e, next) => {
    const saved = await ctx.store.patchEnvironments(next);
    applyLogger(ctx.store);
    await ctx.testing.reloadMocksIfRunning();
    return saved;
  });
  handle(IpcChannels.collectionsGet, NO_ARGS, () => ctx.store.collections);
  handle(IpcChannels.collectionsSet, [patch<CollectionsFile>()], (_e, next) => ctx.store.patchCollections(next));
  handle(IpcChannels.historyGet, NO_ARGS, () => ctx.store.history);
  handle(IpcChannels.historySet, [patch<HistoryFile>()], (_e, next) => ctx.store.patchHistory(next));
  handle(IpcChannels.cookiesGet, NO_ARGS, () => ctx.store.cookies);
  handle(IpcChannels.cookiesSet, [patch<CookiesFile>()], (_e, next) => ctx.store.patchCookies(next));
  handle(IpcChannels.plantumlGet, NO_ARGS, () => ctx.store.plantumlFile);
  handle(IpcChannels.plantumlSet, [patch<PlantumlFile>()], (_e, next) => ctx.store.patchPlantuml(next));
  handle(IpcChannels.flowsGet, NO_ARGS, () => ctx.store.flows);
  handle(IpcChannels.flowsSet, [patch<FlowsFile>()], (_e, next) => ctx.store.patchFlows(next));
  handle(IpcChannels.flowRun, [ipcIdSchema, ipcOptionalIdSchema], (_e, flowId, scenarioId) =>
    ctx.testing.runFlow(flowId, scenarioId),
  );
  handle(IpcChannels.flowRunDraft, [flowRunDraftSchema], (_e, payload) => ctx.testing.runFlowDraft(payload));
  handle(IpcChannels.flowCancel, NO_ARGS, () => ctx.testing.flows.cancel());
  handle(IpcChannels.flowPickSelector, [flowPickSelectorSchema.optional()], (_e, payload) =>
    ctx.testing.pickSelector(payload ?? {}),
  );
  handle(IpcChannels.flowPickDeviceSelector, [flowPickDeviceSelectorSchema.optional()], (_e, payload) =>
    ctx.testing.pickDeviceSelector(payload ?? {}),
  );
  handle(IpcChannels.flowManualReply, [flowManualPromptReplySchema], (_e, reply) => {
    ctx.testing.flows.resolveManualPrompt(reply);
  });
  handle(IpcChannels.deviceStatus, NO_ARGS, () => ctx.testing.android.status());
  handle(IpcChannels.deviceActivate, NO_ARGS, () => ctx.testing.android.activate());
  handle(IpcChannels.deviceStartEmulator, [deviceStartEmulatorSchema.optional()], (_e, payload) =>
    ctx.testing.android.startEmulator({
      coldBoot: payload?.coldBoot === true,
      openHome: payload?.openHome === true,
    }),
  );
  handle(IpcChannels.deviceStopEmulator, NO_ARGS, () => ctx.testing.android.stopEmulator());
  handle(IpcChannels.deviceUninstall, NO_ARGS, () => ctx.testing.android.uninstall());
  handle(IpcChannels.deviceChooseSdkRoot, NO_ARGS, () => ctx.testing.android.chooseSdkRoot());
  handle(IpcChannels.deviceRevealSdk, NO_ARGS, () => ctx.testing.android.revealSdk());
  handle(IpcChannels.deviceRefresh, NO_ARGS, () => ctx.testing.android.refresh());
  handle(IpcChannels.deviceApplySystemImage, NO_ARGS, () => ctx.testing.android.applySystemImage());
  handle(IpcChannels.emulatorGet, NO_ARGS, async () => {
    await ctx.testing.android.syncAvdDevices();
    return ctx.store.emulator;
  });
  handle(IpcChannels.emulatorSet, [patch<EmulatorFile>()], (_e, next) => ctx.store.patchEmulator(next));
  handle(IpcChannels.loadGet, NO_ARGS, () => ctx.store.loadFile);
  handle(IpcChannels.loadSet, [patch<LoadFile>()], (_e, next) => ctx.store.patchLoad(next));
  handle(IpcChannels.loadStart, [ipcIdSchema], (_e, loadId) => ctx.testing.runLoad(loadId));
  handle(IpcChannels.loadStop, NO_ARGS, () => ctx.testing.load.stop());
  handle(IpcChannels.mocksGet, NO_ARGS, () => ctx.store.mocksFile);
  handle(IpcChannels.mocksSet, [patch<MocksFile>()], async (_e, next) => {
    const saved = await ctx.store.patchMocks(next);
    await ctx.testing.reloadMocksIfRunning();
    return saved;
  });
  handle(IpcChannels.mocksStart, NO_ARGS, () => ctx.testing.startMocks());
  handle(IpcChannels.mocksStop, NO_ARGS, () => ctx.testing.stopMocks());
  handle(IpcChannels.listenersGet, NO_ARGS, () => ctx.store.listenersFile);
  handle(IpcChannels.listenersSet, [patch<ListenersFile>()], (_e, next) => ctx.store.patchListeners(next));
  handle(IpcChannels.listenerStart, [ipcIdSchema], (_e, listenerId) => ctx.testing.startListener(listenerId));
  handle(IpcChannels.listenerStop, NO_ARGS, () => ctx.testing.stopListener());
  handle(IpcChannels.interceptGet, NO_ARGS, () => ctx.store.interceptFile);
  handle(IpcChannels.interceptSet, [patch<InterceptFile>()], (_e, next) => ctx.store.patchIntercept(next));
  handle(IpcChannels.interceptStart, [ipcIdSchema], (_e, ruleId) => ctx.testing.startIntercept(ruleId));
  handle(IpcChannels.interceptStop, NO_ARGS, () => ctx.testing.stopIntercept());
  handle(IpcChannels.regressionsGet, NO_ARGS, () => ctx.store.regressions);
  handle(IpcChannels.regressionsSet, [patch<RegressionsFile>()], (_e, next) => ctx.store.patchRegressions(next));
  handle(IpcChannels.regressionRun, [ipcIdSchema, regressionRunOptionsSchema.optional()], (_e, id, options) =>
    ctx.testing.runRegressionWithOptions(id, options),
  );
  handle(IpcChannels.regressionCancel, NO_ARGS, () => ctx.testing.regressions.cancel());
  handle(IpcChannels.flowTemplatesGet, NO_ARGS, () => ctx.store.flowTemplates);
  handle(IpcChannels.flowTemplatesSet, [patch<FlowTemplatesFile>()], (_e, next) =>
    ctx.store.patchFlowTemplates(next),
  );
  handle(IpcChannels.httpExecute, [httpRequestArg], (_e, payload) =>
    ctx.http.execute({
      ...payload,
      proxy: payload.proxy ?? ctx.store.settings.proxy,
      verifyTls: payload.verifyTls ?? ctx.store.settings.certificates.verifyTls,
    }),
  );
  handle(IpcChannels.httpAbort, [ipcIdSchema], (_e, abortId) => ctx.http.abort(abortId));
  handle(IpcChannels.httpOpenUrl, [z.string().max(8192)], (_e, url) => ctx.http.openUrl(url));
  handle(IpcChannels.websocketConnect, [websocketConnectArg], (_e, payload) =>
    ctx.websocket.connect({
      ...payload,
      proxy: payload.proxy ?? ctx.store.settings.proxy,
      verifyTls: payload.verifyTls ?? ctx.store.settings.certificates.verifyTls,
    }),
  );
  handle(IpcChannels.websocketDisconnect, [ipcIdSchema], (_e, connectionId) =>
    ctx.websocket.disconnect(connectionId),
  );
  handle(IpcChannels.websocketSend, [websocketSendRequestSchema], (_e, payload) =>
    ctx.websocket.send(payload.connectionId, payload.data),
  );
  handle(IpcChannels.oauthAuthorize, [oauthClientConfigSchema], (_e, config) =>
    ctx.http.authorize({ ...config, proxy: config.proxy ?? ctx.store.settings.proxy }),
  );
  handle(IpcChannels.oauthToken, [oauthClientConfigSchema], (_e, config) =>
    ctx.http.token({ ...config, proxy: config.proxy ?? ctx.store.settings.proxy }),
  );
  handle(IpcChannels.oauthRefresh, [oauthClientConfigSchema], (_e, config) =>
    ctx.http.refresh({ ...config, proxy: config.proxy ?? ctx.store.settings.proxy }),
  );
  handle(IpcChannels.oauthDeviceStart, [oauthClientConfigSchema], (_e, config) =>
    ctx.http.deviceStart({ ...config, proxy: config.proxy ?? ctx.store.settings.proxy }),
  );
  handle(IpcChannels.oauthDevicePoll, [ipcIdSchema], (_e, sessionId) => ctx.http.devicePoll(sessionId));
  handle(IpcChannels.oauthDeviceCancel, [ipcIdSchema], (_e, sessionId) => ctx.http.deviceCancel(sessionId));
  handle(IpcChannels.databasesGet, NO_ARGS, () => ctx.store.databases);
  handle(IpcChannels.databasesSet, [patch<DatabasesFile>()], (_e, next) => ctx.store.patchDatabases(next));
  handle(IpcChannels.queriesGet, NO_ARGS, () => ctx.store.queries);
  handle(IpcChannels.queriesSet, [patch<QueriesFile>()], (_e, next) => ctx.store.patchQueries(next));
  handle(IpcChannels.databaseTest, [databaseConnectionSchema], (_e, connection) =>
    invokeDatabase(() => ctx.database.test(connection), connection),
  );
  handle(IpcChannels.databaseIntrospect, [databaseIntrospectRequestSchema], (_e, payload) =>
    invokeDatabase(() => ctx.database.introspect(payload), payload.connection),
  );
  handle(IpcChannels.databaseQuery, [databaseQueryRequestSchema], (_e, payload) =>
    invokeDatabase(() => ctx.database.query(payload), payload.connection),
  );
  handle(IpcChannels.databaseDisconnect, [ipcIdSchema], (_e, connectionId) =>
    invokeDatabase(() => ctx.database.disconnect(connectionId)),
  );
  handle(IpcChannels.databaseStatuses, NO_ARGS, () => ctx.database.statusesSnapshot());
  handle(IpcChannels.databaseSessionQuery, [databaseSessionQueryRequestSchema], (_e, payload) => {
    const hold = payload.hold === true || shouldHoldSqlSession(payload.query, payload.connection.type);
    return invokeDatabase(() => ctx.database.sessionQuery(payload, hold), payload.connection);
  });
  handle(IpcChannels.databaseSessionCommit, [ipcIdSchema], (_e, tabId) => {
    const connection = connectionForTab(ctx, tabId);
    return invokeDatabase(() => ctx.database.sessionCommit(tabId, connection), connection);
  });
  handle(IpcChannels.databaseSessionRollback, [ipcIdSchema], (_e, tabId) => {
    const connection = connectionForTab(ctx, tabId);
    return invokeDatabase(() => ctx.database.sessionRollback(tabId, connection), connection);
  });
  handle(IpcChannels.databaseWarmBoot, NO_ARGS, async () => {
    if (!ctx.store.settings.database.connectOnStartup)
      return;
    await invokeDatabase(() => ctx.database.warmBoot(flattenDatabaseConnections(ctx.store.databases.nodes)));
  });
  handle(IpcChannels.workspacesGet, NO_ARGS, () => ctx.store.workspaces);
  handle(IpcChannels.workspacesSwitch, [ipcIdSchema], async (_e, id) => {
    const next = await ctx.store.switchWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  handle(IpcChannels.workspacesCreate, [workspaceNameSchema], async (_e, name) => {
    const next = await ctx.store.createWorkspace(name);
    applyLogger(ctx.store);
    return next;
  });
  handle(IpcChannels.workspacesRename, [ipcIdSchema, workspaceNameSchema], (_e, id, name) =>
    ctx.store.renameWorkspace(id, name),
  );
  handle(IpcChannels.workspacesReorder, [workspaceOrderSchema], (_e, orderIds) =>
    ctx.store.reorderWorkspaces(orderIds),
  );
  handle(IpcChannels.workspacesDuplicate, [ipcIdSchema], async (_e, id) => {
    const next = await ctx.store.duplicateWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  handle(IpcChannels.workspacesDelete, [ipcIdSchema], async (_e, id) => {
    const next = await ctx.store.deleteWorkspace(id);
    applyLogger(ctx.store);
    return next;
  });
  handle(IpcChannels.workspaceExportPack, [workspacePackSelectionSchema], (_e, selection) =>
    ctx.workspacePack.exportPack(selection),
  );
  handle(IpcChannels.workspaceImportPick, NO_ARGS, () => ctx.workspacePack.pickImportSource());
  handle(IpcChannels.workspaceImportInspect, [pathArg], (_e, filePath) => ctx.workspacePack.importInspect(filePath));
  handle(IpcChannels.workspaceImportInspectBytes, [importFileNameSchema, z.unknown()], (_e, name, bytes) => {
    const raw = coerceImportBytes(bytes);
    if (!raw || raw.byteLength === 0)
      throw new Error('Dropped file was empty or could not be read.');
    return ctx.workspacePack.importInspectBytes(name, raw);
  });
  handle(IpcChannels.workspaceImportApply, [workspaceImportApplyRequestSchema], async (_e, request) => {
    const next = await ctx.workspacePack.importApply(request);
    applyLogger(ctx.store);
    return next;
  });
  ipcMain.on(IpcChannels.workspaceImportAllowPath, (event, filePath: unknown) => {
    if (!isTrustedSenderUrl(event.senderFrame?.url ?? ''))
      return;
    const parsed = pathArg.safeParse(filePath);
    if (parsed.success)
      ctx.workspacePack.allowImportPath(parsed.data);
  });
  handle(IpcChannels.logsRecent, NO_ARGS, () => appLogger.recentLines());
  handle(IpcChannels.collabGetStatus, NO_ARGS, () => ctx.collab.status());
  handle(IpcChannels.collabConnectRepo, [collabConnectSchema], (_e, request) => ctx.collab.connectRepo(request));
  handle(IpcChannels.collabDisconnectRepo, [ipcIdSchema], (_e, repoId) => ctx.collab.disconnectRepo(repoId));
  handle(IpcChannels.collabAddWorkspaces, [collabAddWorkspacesSchema], (_e, request) =>
    ctx.collab.addWorkspaces(request),
  );
  handle(IpcChannels.collabPublishWorkspace, [collabPublishWorkspaceSchema], (_e, request) =>
    ctx.collab.publishWorkspace(request),
  );
  handle(IpcChannels.collabRemoveFromPc, [ipcIdSchema], (_e, workspaceId) => ctx.collab.removeFromPc(workspaceId));
  handle(IpcChannels.collabRemoveFromRepo, [collabRemoveFromRepoSchema], (_e, request) =>
    ctx.collab.removeFromRepo(request),
  );
  handle(IpcChannels.collabPause, [ipcOptionalIdSchema], (_e, repoId) => ctx.collab.pause(repoId));
  handle(IpcChannels.collabResume, [ipcOptionalIdSchema], (_e, repoId) => ctx.collab.resume(repoId));
  handle(IpcChannels.collabSyncNow, [ipcOptionalIdSchema], (_e, repoId) => ctx.collab.syncNow(true, repoId));
  handle(IpcChannels.collabResolve, [collabResolveSchema], (_e, request) =>
    ctx.collab.resolve(request.id, request.choice),
  );
  handle(IpcChannels.collabSetIdentity, [collabIdentitySchema], (_e, request) =>
    ctx.collab.setIdentity(request.name, request.email),
  );
  handle(IpcChannels.collabForgetCredential, [ipcOptionalIdSchema], (_e, repoId) =>
    ctx.collab.forgetCredential(repoId),
  );
  handle(IpcChannels.collabUpdateCredential, [collabUpdateCredentialSchema], (_e, request) =>
    ctx.collab.updateCredential(request),
  );
  handle(IpcChannels.collabSetPresenceMode, [collabPresenceModeSchema.shape.mode], (_e, mode) =>
    ctx.collab.setPresenceMode(mode),
  );
  handle(IpcChannels.collabSetShareRuns, [z.boolean()], (_e, enabled) => ctx.collab.setShareRuns(enabled));
  handle(IpcChannels.collabSetBranch, [collabBranchSchema.shape.branch, ipcOptionalIdSchema], (_e, branch, repoId) =>
    ctx.collab.setBranch(branch, repoId),
  );
  handle(IpcChannels.collabSetWatching, [z.boolean()], (_e, watching) => ctx.collab.setWatching(watching));
  handle(IpcChannels.collabAcquireLock, [collabLockRequestSchema], (_e, request) => ctx.collab.acquireLock(request));
  handle(IpcChannels.collabTakeOverLock, [collabLockRequestSchema], (_e, request) =>
    ctx.collab.takeOverLock(request),
  );
  handle(IpcChannels.collabRenewLock, [collabLockProgressSchema], (_e, request) =>
    ctx.collab.renewLock(request.packId, request.completed, request.total),
  );
  handle(IpcChannels.collabReleaseLock, [ipcIdSchema], (_e, packId) => ctx.collab.releaseLock(packId));
  handle(IpcChannels.collabPublishRun, [collabRunPublishSchema], (_e, request) => ctx.collab.publishRun(request));
  handle(IpcChannels.updateGetStatus, NO_ARGS, () => ctx.updates.status());
  handle(IpcChannels.updateCheck, NO_ARGS, () => ctx.updates.check());
  handle(IpcChannels.updateDownload, NO_ARGS, () => ctx.updates.download());
  handle(IpcChannels.updateInstall, NO_ARGS, () => ctx.updates.install());
  handle(IpcChannels.updateSetPrefs, [updatePrefsPatchSchema], (_e, patch) => ctx.updates.setPrefs(patch));
  handle(IpcChannels.configPaths, NO_ARGS, () => ctx.store.paths());
  handle(IpcChannels.configWorkspaceFootprint, NO_ARGS, () => ctx.store.workspaceFootprint());
  handle(IpcChannels.configReveal, [configRevealTargetSchema], async (_e, target) => {
    await ctx.store.reveal(target);
  });
  handle(IpcChannels.configChooseFolder, NO_ARGS, async () => {
    const picked = await showOpenDialog(ctx, {
      title: 'Choose config folder',
      defaultPath: ctx.store.folder(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!picked)
      return null;
    const paths = await ctx.store.setFolder(picked);
    applyLogger(ctx.store);
    const snapshot = ctx.store.applyTheme(ctx.store.settings.theme);
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, snapshot);
    return paths;
  });
  handle(IpcChannels.configChooseLogsFolder, NO_ARGS, async () => {
    const picked = await showOpenDialog(ctx, {
      title: 'Choose logs folder',
      defaultPath: ctx.store.logsFolder(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!picked)
      return null;
    await ctx.store.patchSettings({ logsFolder: picked });
    applyLogger(ctx.store);
    return ctx.store.paths();
  });
  handle(IpcChannels.configChooseConfigsFolder, NO_ARGS, async () => {
    const picked = await showOpenDialog(ctx, {
      title: 'Choose configs folder',
      defaultPath: ctx.store.configsPath(),
      properties: ['openDirectory', 'createDirectory'],
    });
    return picked ? ctx.store.setConfigsFolder(picked) : null;
  });
  handle(IpcChannels.configChooseFile, [chooseFileKindSchema], (_e, kind) =>
    showOpenDialog(ctx, chooseFileDialogOptions(kind)),
  );

  nativeTheme.on('updated', () => {
    ctx.getMainWindow()?.webContents.send(IpcChannels.themeChanged, ctx.store.snapshot());
  });

  const win = ctx.getMainWindow();
  win?.on('maximize', () => win.webContents.send(IpcChannels.windowMaximizedChanged, true));
  win?.on('unmaximize', () => win.webContents.send(IpcChannels.windowMaximizedChanged, false));
}

async function showOpenDialog(ctx: IpcContext, options: OpenDialogOptions): Promise<string | null> {
  const win = ctx.getMainWindow();
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0)
    return null;
  return result.filePaths[0] ?? null;
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
  if (kind === 'apk') {
    return {
      title: 'Choose APK',
      properties: ['openFile'],
      filters: [
        { name: 'Android package', extensions: ['apk'] },
        { name: 'All files', extensions: ['*'] },
      ],
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

function deferWindowAction(
  win: BrowserWindow,
  action: (next: BrowserWindow) => void,
): void {
  setTimeout(() => {
    if (!win.isDestroyed())
      action(win);
  }, 0);
}

function coerceImportBytes(bytes: unknown): Uint8Array | null {
  if (bytes instanceof Uint8Array)
    return bytes;
  if (bytes instanceof ArrayBuffer)
    return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes))
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes) && bytes.every((value) => typeof value === 'number'))
    return Uint8Array.from(bytes);
  if (bytes && typeof bytes === 'object' && Array.isArray((bytes as { data?: unknown }).data)) {
    const data = (bytes as { data: unknown[] }).data;
    if (data.every((value) => typeof value === 'number'))
      return Uint8Array.from(data);
  }
  return null;
}

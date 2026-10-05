import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron';

import { IpcChannels } from '@testrix/contracts/ipc-channels';
import { clampUiZoom } from '@testrix/contracts/ui-zoom';
import type { TestrixDesktopApi } from '@testrix/contracts/preload-api';

webFrame.setVisualZoomLevelLimits(1, 1);

function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
}

const api: TestrixDesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannels.appGetVersion),
    getPlatform: () => ipcRenderer.invoke(IpcChannels.appGetPlatform),
    notifyReady: () => ipcRenderer.invoke(IpcChannels.appNotifyReady),
    reload: () => ipcRenderer.invoke(IpcChannels.appReload),
  },
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.windowMinimize),
    maximize: () => ipcRenderer.invoke(IpcChannels.windowMaximize),
    close: () => ipcRenderer.invoke(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    setMovable: (movable) => ipcRenderer.invoke(IpcChannels.windowSetMovable, movable),
    setZoomFactor: (factor) => {
      webFrame.setZoomFactor(clampUiZoom(factor));
    },
    openWorkbench: () => ipcRenderer.invoke(IpcChannels.windowOpenWorkbench),
    onMaximizedChanged: (listener) => {
      const channel = IpcChannels.windowMaximizedChanged;
      const wrapped = (_event: unknown, value: boolean) => listener(value);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.off(channel, wrapped);
    },
    onWorkspaceFilesChanged: (listener) => listen(IpcChannels.workspaceFilesChanged, () => listener()),
  },
  theme: {
    get: () => ipcRenderer.invoke(IpcChannels.themeGet),
    set: (preference) => ipcRenderer.invoke(IpcChannels.themeSet, preference),
    onChanged: (listener) => {
      const channel = IpcChannels.themeChanged;
      const wrapped = (_event: unknown, snapshot: Parameters<typeof listener>[0]) => listener(snapshot);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.off(channel, wrapped);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.settingsSet, patch),
    reset: (scope) => ipcRenderer.invoke(IpcChannels.settingsReset, scope),
  },
  session: {
    get: () => ipcRenderer.invoke(IpcChannels.sessionGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.sessionSet, patch),
  },
  environments: {
    get: () => ipcRenderer.invoke(IpcChannels.environmentsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.environmentsSet, patch),
  },
  collections: {
    get: () => ipcRenderer.invoke(IpcChannels.collectionsGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.collectionsSet, patch),
  },
  history: {
    get: () => ipcRenderer.invoke(IpcChannels.historyGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.historySet, patch),
  },
  cookies: {
    get: () => ipcRenderer.invoke(IpcChannels.cookiesGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.cookiesSet, patch),
  },
  plantuml: {
    get: () => ipcRenderer.invoke(IpcChannels.plantumlGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.plantumlSet, patch),
  },
  services: {
    flows: {
      get: () => ipcRenderer.invoke(IpcChannels.flowsGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.flowsSet, patch),
      run: (flowId, scenarioId) => ipcRenderer.invoke(IpcChannels.flowRun, flowId, scenarioId),
      runDraft: (payload) => ipcRenderer.invoke(IpcChannels.flowRunDraft, payload),
      cancel: () => ipcRenderer.invoke(IpcChannels.flowCancel),
      pickSelector: (payload) => ipcRenderer.invoke(IpcChannels.flowPickSelector, payload),
      pickDeviceSelector: (payload) => ipcRenderer.invoke(IpcChannels.flowPickDeviceSelector, payload),
      replyManualPrompt: (reply) => ipcRenderer.invoke(IpcChannels.flowManualReply, reply),
    },
    load: {
      get: () => ipcRenderer.invoke(IpcChannels.loadGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.loadSet, patch),
      start: (loadId) => ipcRenderer.invoke(IpcChannels.loadStart, loadId),
      stop: () => ipcRenderer.invoke(IpcChannels.loadStop),
    },
    mocks: {
      get: () => ipcRenderer.invoke(IpcChannels.mocksGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.mocksSet, patch),
      start: () => ipcRenderer.invoke(IpcChannels.mocksStart),
      stop: () => ipcRenderer.invoke(IpcChannels.mocksStop),
    },
    listeners: {
      get: () => ipcRenderer.invoke(IpcChannels.listenersGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.listenersSet, patch),
      start: (listenerId) => ipcRenderer.invoke(IpcChannels.listenerStart, listenerId),
      stop: () => ipcRenderer.invoke(IpcChannels.listenerStop),
    },
    intercept: {
      get: () => ipcRenderer.invoke(IpcChannels.interceptGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.interceptSet, patch),
      start: (ruleId) => ipcRenderer.invoke(IpcChannels.interceptStart, ruleId),
      stop: () => ipcRenderer.invoke(IpcChannels.interceptStop),
    },
    regressions: {
      get: () => ipcRenderer.invoke(IpcChannels.regressionsGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.regressionsSet, patch),
      run: (id, options) => ipcRenderer.invoke(IpcChannels.regressionRun, id, options),
      cancel: () => ipcRenderer.invoke(IpcChannels.regressionCancel),
    },
    flowTemplates: {
      get: () => ipcRenderer.invoke(IpcChannels.flowTemplatesGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.flowTemplatesSet, patch),
    },
    emulator: {
      get: () => ipcRenderer.invoke(IpcChannels.emulatorGet),
      set: (patch) => ipcRenderer.invoke(IpcChannels.emulatorSet, patch),
    },
    device: {
      status: () => ipcRenderer.invoke(IpcChannels.deviceStatus),
      activate: () => ipcRenderer.invoke(IpcChannels.deviceActivate),
      startEmulator: (payload?: { readonly coldBoot?: boolean; readonly openHome?: boolean }) =>
        ipcRenderer.invoke(IpcChannels.deviceStartEmulator, payload),
      stopEmulator: () => ipcRenderer.invoke(IpcChannels.deviceStopEmulator),
      uninstall: () => ipcRenderer.invoke(IpcChannels.deviceUninstall),
      chooseSdkRoot: () => ipcRenderer.invoke(IpcChannels.deviceChooseSdkRoot),
      revealSdk: () => ipcRenderer.invoke(IpcChannels.deviceRevealSdk),
      refresh: () => ipcRenderer.invoke(IpcChannels.deviceRefresh),
      applySystemImage: () => ipcRenderer.invoke(IpcChannels.deviceApplySystemImage),
    },
    onFlowEvent: (listener) => listen(IpcChannels.flowEvent, listener),
    onFlowManualPrompt: (listener) => listen(IpcChannels.flowManualPrompt, listener),
    onLoadMetrics: (listener) => listen(IpcChannels.loadMetrics, listener),
    onMocksActivity: (listener) => listen(IpcChannels.mocksActivity, listener),
    onListenerHit: (listener) => listen(IpcChannels.listenerHit, listener),
    onListenerStatus: (listener) => listen(IpcChannels.listenerStatus, listener),
    onInterceptHit: (listener) => listen(IpcChannels.interceptHit, listener),
    onInterceptStatus: (listener) => listen(IpcChannels.interceptStatus, listener),
    onRegressionEvent: (listener) => listen(IpcChannels.regressionEvent, listener),
    onDeviceEvent: (listener) => listen(IpcChannels.deviceEvent, listener),
  },
  http: {
    execute: (payload) => ipcRenderer.invoke(IpcChannels.httpExecute, payload),
    abort: (abortId) => ipcRenderer.invoke(IpcChannels.httpAbort, abortId),
    openUrl: (url) => ipcRenderer.invoke(IpcChannels.httpOpenUrl, url),
  },
  websocket: {
    connect: (payload) => ipcRenderer.invoke(IpcChannels.websocketConnect, payload),
    disconnect: (connectionId) => ipcRenderer.invoke(IpcChannels.websocketDisconnect, connectionId),
    send: (payload) => ipcRenderer.invoke(IpcChannels.websocketSend, payload),
    onEvent: (listener) => listen(IpcChannels.websocketEvent, listener),
  },
  oauth: {
    authorize: (config) => ipcRenderer.invoke(IpcChannels.oauthAuthorize, config),
    token: (config) => ipcRenderer.invoke(IpcChannels.oauthToken, config),
    refresh: (config) => ipcRenderer.invoke(IpcChannels.oauthRefresh, config),
    deviceStart: (config) => ipcRenderer.invoke(IpcChannels.oauthDeviceStart, config),
    devicePoll: (sessionId) => ipcRenderer.invoke(IpcChannels.oauthDevicePoll, sessionId),
    deviceCancel: (sessionId) => ipcRenderer.invoke(IpcChannels.oauthDeviceCancel, sessionId),
  },
  databases: {
    get: () => ipcRenderer.invoke(IpcChannels.databasesGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.databasesSet, patch),
  },
  queries: {
    get: () => ipcRenderer.invoke(IpcChannels.queriesGet),
    set: (patch) => ipcRenderer.invoke(IpcChannels.queriesSet, patch),
  },
  database: {
    test: (connection) => ipcRenderer.invoke(IpcChannels.databaseTest, connection),
    introspect: (payload) => ipcRenderer.invoke(IpcChannels.databaseIntrospect, payload),
    query: (payload) => ipcRenderer.invoke(IpcChannels.databaseQuery, payload),
    disconnect: (connectionId) => ipcRenderer.invoke(IpcChannels.databaseDisconnect, connectionId),
    statuses: () => ipcRenderer.invoke(IpcChannels.databaseStatuses),
    sessionQuery: (payload) => ipcRenderer.invoke(IpcChannels.databaseSessionQuery, payload),
    sessionCommit: (tabId) => ipcRenderer.invoke(IpcChannels.databaseSessionCommit, tabId),
    sessionRollback: (tabId) => ipcRenderer.invoke(IpcChannels.databaseSessionRollback, tabId),
    warmBoot: () => ipcRenderer.invoke(IpcChannels.databaseWarmBoot),
  },
  workspaces: {
    get: () => ipcRenderer.invoke(IpcChannels.workspacesGet),
    switch: (id) => ipcRenderer.invoke(IpcChannels.workspacesSwitch, id),
    create: (name) => ipcRenderer.invoke(IpcChannels.workspacesCreate, name),
    rename: (id, name) => ipcRenderer.invoke(IpcChannels.workspacesRename, id, name),
    reorder: (orderIds) => ipcRenderer.invoke(IpcChannels.workspacesReorder, orderIds),
    duplicate: (id) => ipcRenderer.invoke(IpcChannels.workspacesDuplicate, id),
    delete: (id) => ipcRenderer.invoke(IpcChannels.workspacesDelete, id),
  },
  workspace: {
    exportPack: (selection) => ipcRenderer.invoke(IpcChannels.workspaceExportPack, selection),
    pickImportSource: () => ipcRenderer.invoke(IpcChannels.workspaceImportPick),
    importInspect: (filePath) => ipcRenderer.invoke(IpcChannels.workspaceImportInspect, filePath),
    importInspectBytes: (fileName, bytes) => {
      // Sandboxed preload must not require('buffer'); the renderer may hand over any byte view.
      const input: unknown = bytes;
      const raw =
        input instanceof Uint8Array
          ? input
          : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : input instanceof ArrayBuffer
              ? new Uint8Array(input)
              : null;
      if (!raw || raw.byteLength === 0)
        return Promise.reject(new Error('Dropped file was empty or could not be read.'));
      return ipcRenderer.invoke(IpcChannels.workspaceImportInspectBytes, fileName, raw);
    },
    importApply: (request) => ipcRenderer.invoke(IpcChannels.workspaceImportApply, request),
    pathForFile: (file) => {
      try {
        const resolved = webUtils.getPathForFile(file);
        if (!resolved?.trim())
          return null;
        ipcRenderer.send(IpcChannels.workspaceImportAllowPath, resolved);
        return resolved;
      } catch {
        return null;
      }
    },
  },
  config: {
    paths: () => ipcRenderer.invoke(IpcChannels.configPaths),
    workspaceFootprint: () => ipcRenderer.invoke(IpcChannels.configWorkspaceFootprint),
    reveal: (target) => ipcRenderer.invoke(IpcChannels.configReveal, target),
    chooseFolder: () => ipcRenderer.invoke(IpcChannels.configChooseFolder),
    chooseLogsFolder: () => ipcRenderer.invoke(IpcChannels.configChooseLogsFolder),
    chooseConfigsFolder: () => ipcRenderer.invoke(IpcChannels.configChooseConfigsFolder),
    chooseFile: (kind) => ipcRenderer.invoke(IpcChannels.configChooseFile, kind),
  },
  logs: {
    recent: () => ipcRenderer.invoke(IpcChannels.logsRecent),
  },
  collab: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.collabGetStatus),
    onStatus: (listener) => listen(IpcChannels.collabStatus, listener),
    connectRepo: (request) => ipcRenderer.invoke(IpcChannels.collabConnectRepo, request),
    disconnectRepo: (repoId) => ipcRenderer.invoke(IpcChannels.collabDisconnectRepo, repoId),
    addWorkspaces: (request) => ipcRenderer.invoke(IpcChannels.collabAddWorkspaces, request),
    publishWorkspace: (request) => ipcRenderer.invoke(IpcChannels.collabPublishWorkspace, request),
    removeFromPc: (workspaceId) => ipcRenderer.invoke(IpcChannels.collabRemoveFromPc, workspaceId),
    removeFromRepo: (request) => ipcRenderer.invoke(IpcChannels.collabRemoveFromRepo, request),
    pause: (repoId) => ipcRenderer.invoke(IpcChannels.collabPause, repoId),
    resume: (repoId) => ipcRenderer.invoke(IpcChannels.collabResume, repoId),
    syncNow: (repoId) => ipcRenderer.invoke(IpcChannels.collabSyncNow, repoId),
    resolve: (request) => ipcRenderer.invoke(IpcChannels.collabResolve, request),
    setIdentity: (request) => ipcRenderer.invoke(IpcChannels.collabSetIdentity, request),
    forgetCredential: (repoId) => ipcRenderer.invoke(IpcChannels.collabForgetCredential, repoId),
    updateCredential: (request) => ipcRenderer.invoke(IpcChannels.collabUpdateCredential, request),
    setPresenceMode: (mode) => ipcRenderer.invoke(IpcChannels.collabSetPresenceMode, mode),
    setShareRuns: (enabled) => ipcRenderer.invoke(IpcChannels.collabSetShareRuns, enabled),
    setBranch: (branch, repoId) => ipcRenderer.invoke(IpcChannels.collabSetBranch, branch, repoId),
    setWatching: (watching) => ipcRenderer.invoke(IpcChannels.collabSetWatching, watching),
    acquireLock: (request) => ipcRenderer.invoke(IpcChannels.collabAcquireLock, request),
    renewLock: (packId, completed, total) =>
      ipcRenderer.invoke(IpcChannels.collabRenewLock, { packId, completed, total }),
    releaseLock: (packId) => ipcRenderer.invoke(IpcChannels.collabReleaseLock, packId),
    takeOverLock: (request) => ipcRenderer.invoke(IpcChannels.collabTakeOverLock, request),
    publishRun: (request) => ipcRenderer.invoke(IpcChannels.collabPublishRun, request),
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.updateGetStatus),
    onStatus: (listener) => listen(IpcChannels.updateStatus, listener),
    check: () => ipcRenderer.invoke(IpcChannels.updateCheck),
    download: () => ipcRenderer.invoke(IpcChannels.updateDownload),
    install: () => ipcRenderer.invoke(IpcChannels.updateInstall),
    setPrefs: (patch) => ipcRenderer.invoke(IpcChannels.updateSetPrefs, patch),
  },
};

contextBridge.exposeInMainWorld('testrix', api);

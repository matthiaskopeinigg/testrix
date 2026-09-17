import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels, type TestrixDesktopApi } from '@testrix/contracts';

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
    onMaximizedChanged: (listener) => {
      const channel = IpcChannels.windowMaximizedChanged;
      const wrapped = (_event: unknown, value: boolean) => listener(value);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.off(channel, wrapped);
    },
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
    explain: (payload) => ipcRenderer.invoke(IpcChannels.databaseExplain, payload),
    disconnect: (connectionId) => ipcRenderer.invoke(IpcChannels.databaseDisconnect, connectionId),
    statuses: () => ipcRenderer.invoke(IpcChannels.databaseStatuses),
    sessionQuery: (payload) => ipcRenderer.invoke(IpcChannels.databaseSessionQuery, payload),
    sessionCommit: (tabId) => ipcRenderer.invoke(IpcChannels.databaseSessionCommit, tabId),
    sessionRollback: (tabId) => ipcRenderer.invoke(IpcChannels.databaseSessionRollback, tabId),
    sessionClose: (tabId) => ipcRenderer.invoke(IpcChannels.databaseSessionClose, tabId),
    warmBoot: () => ipcRenderer.invoke(IpcChannels.databaseWarmBoot),
  },
  workspaces: {
    get: () => ipcRenderer.invoke(IpcChannels.workspacesGet),
    switch: (id) => ipcRenderer.invoke(IpcChannels.workspacesSwitch, id),
    create: (name) => ipcRenderer.invoke(IpcChannels.workspacesCreate, name),
    rename: (id, name) => ipcRenderer.invoke(IpcChannels.workspacesRename, id, name),
    duplicate: (id) => ipcRenderer.invoke(IpcChannels.workspacesDuplicate, id),
    delete: (id) => ipcRenderer.invoke(IpcChannels.workspacesDelete, id),
  },
  config: {
    paths: () => ipcRenderer.invoke(IpcChannels.configPaths),
    reveal: (target) => ipcRenderer.invoke(IpcChannels.configReveal, target),
    chooseFolder: () => ipcRenderer.invoke(IpcChannels.configChooseFolder),
    chooseLogsFolder: () => ipcRenderer.invoke(IpcChannels.configChooseLogsFolder),
    chooseConfigsFolder: () => ipcRenderer.invoke(IpcChannels.configChooseConfigsFolder),
    chooseFile: (kind) => ipcRenderer.invoke(IpcChannels.configChooseFile, kind),
  },
  logs: {
    recent: () => ipcRenderer.invoke(IpcChannels.logsRecent),
  },
};

contextBridge.exposeInMainWorld('testrix', api);

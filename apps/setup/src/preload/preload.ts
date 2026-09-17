import { contextBridge, ipcRenderer } from 'electron';

import { SetupIpcChannels, type SetupDesktopApi } from '@testrix/contracts';

const api: SetupDesktopApi = {
  getMeta: () => ipcRenderer.invoke(SetupIpcChannels.getMeta),
  chooseDirectory: (current) => ipcRenderer.invoke(SetupIpcChannels.chooseDirectory, current),
  startInstall: (request) => ipcRenderer.invoke(SetupIpcChannels.startInstall, request),
  startUninstall: (request) => ipcRenderer.invoke(SetupIpcChannels.startUninstall, request),
  cancel: () => ipcRenderer.invoke(SetupIpcChannels.cancel),
  launchApp: () => ipcRenderer.invoke(SetupIpcChannels.launchApp),
  windowMinimize: () => ipcRenderer.invoke(SetupIpcChannels.windowMinimize),
  windowClose: () => ipcRenderer.invoke(SetupIpcChannels.windowClose),
  openExternal: (url) => ipcRenderer.invoke(SetupIpcChannels.openExternal, url),
  onProgress: (listener) => {
    const wrapped = (_e: unknown, event: Parameters<typeof listener>[0]) => listener(event);
    ipcRenderer.on(SetupIpcChannels.progress, wrapped);
    return () => ipcRenderer.off(SetupIpcChannels.progress, wrapped);
  },
};

contextBridge.exposeInMainWorld('testrixSetup', api);

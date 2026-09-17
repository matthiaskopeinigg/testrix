import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels, type TestrixErrorApi } from '@testrix/contracts';

const api: TestrixErrorApi = {
  quit: () => ipcRenderer.invoke(IpcChannels.errorQuit),
  relaunch: () => ipcRenderer.invoke(IpcChannels.errorRelaunch),
};

contextBridge.exposeInMainWorld('testrixError', api);

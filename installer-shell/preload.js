const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupApi', {
  getVersion: () => ipcRenderer.invoke('setup:getVersion'),
  getPlatform: () => ipcRenderer.invoke('setup:getPlatform'),
  getDefaultPaths: (scope) => ipcRenderer.invoke('setup:getDefaultPaths', scope),
  getPayloadInfo: () => ipcRenderer.invoke('setup:getPayloadInfo'),
  install: (opts) => ipcRenderer.invoke('setup:install', opts),
  launchApp: (exePath) => ipcRenderer.invoke('setup:launchApp', exePath),
  uninstall: () => ipcRenderer.invoke('setup:uninstall'),
  quit: () => ipcRenderer.invoke('setup:quit'),
  minimize: () => ipcRenderer.invoke('setup:minimize'),
  openExternal: (url) => ipcRenderer.invoke('setup:openExternal', url),

  /**
   * Subscribes to install progress events. Calls `cb({ phase, percent, current })`
   * where `phase` is one of 'preparing' | 'copying' | 'finalizing' | 'done',
   * `percent` is 0..1 or null (indeterminate, machine-scope copy via elevated
   * robocopy), and `current` is the relative file path being copied.
   *
   * Returns an unsubscribe function.
   */
  onProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('setup:progress', handler);
    return () => ipcRenderer.off('setup:progress', handler);
  },
});

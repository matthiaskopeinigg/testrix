/**
 * Preload bridge for the uninstaller window. Mirrors the installer's
 * `setupApi` shape (so the design is one-to-one), but every channel goes
 * through `uninstall:*` IPC names handled by `uninstaller.service.js`.
 *
 * The renderer never touches Node APIs directly — all OS cleanup lives in the
 * main process so the same UI works for Windows, macOS, and Linux without
 * special-casing in the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('uninstallerApi', {
  getVersion: () => ipcRenderer.invoke('uninstall:getVersion'),
  getPlatform: () => ipcRenderer.invoke('uninstall:getPlatform'),
  getInstallInfo: () => ipcRenderer.invoke('uninstall:getInstallInfo'),
  uninstall: (opts) => ipcRenderer.invoke('uninstall:run', opts),
  quit: () => ipcRenderer.invoke('uninstall:quit'),
  minimize: () => ipcRenderer.invoke('uninstall:minimize'),
  openExternal: (url) => ipcRenderer.invoke('uninstall:openExternal', url),

  /**
   * Subscribes to uninstall progress events. Calls
   * `cb({ phase, percent, current })` where `phase` is one of
   * 'preparing' | 'removing-shortcuts' | 'removing-registry' |
   * 'removing-data' | 'removing-app' | 'scheduled' | 'done', and `percent`
   * is 0..1 or null (indeterminate).
   *
   * Returns an unsubscribe function.
   */
  onProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('uninstall:progress', handler);
    return () => ipcRenderer.off('uninstall:progress', handler);
  },
});

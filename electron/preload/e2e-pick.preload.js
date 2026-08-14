const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bridge for the element picker on the shared E2E runner window (see e2e-pick-element.service.js).
 * Injected page script calls these from the main world after navigation.
 */
contextBridge.exposeInMainWorld('__AW_PICK_BRIDGE__', {
  report: (payload) => {
    ipcRenderer.send('e2e:pick-element:result', payload && typeof payload === 'object' ? payload : {});
  },
  cancel: () => {
    ipcRenderer.send('e2e:pick-element:cancel');
  },
  saveScrollPosition: (payload) => {
    ipcRenderer.send(
      'e2e:pick-scroll-position:save',
      payload && typeof payload === 'object' ? payload : {},
    );
  },
  cancelScrollPositionPick: () => {
    ipcRenderer.send('e2e:pick-scroll-position:cancel');
  },
});

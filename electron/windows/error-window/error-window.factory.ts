import { BrowserWindow } from 'electron';

import { appIconBrowserWindowOptions } from '../../config/app-icon';
import { resolveErrorHtmlPath } from '../../config/paths';

import { errorWindowDefaults } from './error-window.options';

export function createErrorWindow(message: string, parent?: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    ...errorWindowDefaults,
    ...appIconBrowserWindowOptions(),
    title: 'Testrix · Problem',
    ...(parent && !parent.isDestroyed() ? { parent, modal: true } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void win.loadFile(resolveErrorHtmlPath());
  win.webContents.once('did-finish-load', () => {
    void win.webContents
      .executeJavaScript(
        `(()=>{var el=document.getElementById('tx-error-message'); if(el){el.textContent=${JSON.stringify(message)};}})();`,
      )
      .then(() => {
        win.show();
      })
      .catch(() => {
        win.show();
      });
  });

  return win;
}

import { BrowserWindow } from 'electron';

import { appIconBrowserWindowOptions } from '../../config/app-icon';
import { resolveErrorHtmlPath } from '../../config/paths';
import { buildErrorReportIssueUrl } from '../../config/repository';
import { attachExternalLinkHandlers } from '../main-window/external-link-handlers';

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

  win.removeMenu();
  win.center();
  attachExternalLinkHandlers(win);

  void win.loadFile(resolveErrorHtmlPath());
  win.webContents.once('did-finish-load', () => {
    const reportUrl = buildErrorReportIssueUrl(message);
    void win.webContents
      .executeJavaScript(
        `(()=>{var fn=window.txErrorSetup; if(typeof fn==='function'){fn(${JSON.stringify(message)}, ${JSON.stringify(reportUrl)});} else {var el=document.getElementById('tx-error-message'); if(el){el.textContent=${JSON.stringify(message)};}}})();`,
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

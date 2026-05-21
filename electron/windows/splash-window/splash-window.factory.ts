import { BrowserWindow, app } from 'electron';

import { appIconBrowserWindowOptions } from '../../config/app-icon';
import { resolveSplashHtmlPath } from '../../config/paths';
import { splashWindowDefaults } from './splash-window.options';

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...splashWindowDefaults,
    ...appIconBrowserWindowOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.center();
  win.show();
  win.focus();
  if (process.platform === 'win32') {
    win.moveTop();
  }

  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.focus();
    }
  });

  win.webContents.once('did-fail-load', (_ev, ec, description) => {
    console.error('[electron splash] did-fail-load', ec, description);
    if (!win.isDestroyed()) {
      win.focus();
    }
  });

  const html = resolveSplashHtmlPath();
  void win.loadFile(html, { query: { version: app.getVersion() } });
  return win;
}

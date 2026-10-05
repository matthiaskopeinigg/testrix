import { BrowserWindow } from 'electron';

import {
  applyWindowIcon,
  bundledPath,
  resolveExtraResource,
  sandboxedWebPreferences,
  splashWindowDefaults,
  windowIconOption,
} from '@testrix/electron-core';

import { guardWorkbenchContents } from './web-contents-guard';

export interface SplashWindowOptions {
  readonly preview?: boolean;
}

export function resolveSplashHtmlPath(): string {
  if (process.env['TESTRIX_SPLASH_HTML']) {
    return process.env['TESTRIX_SPLASH_HTML'];
  }
  return resolveExtraResource('splash/splash.html', bundledPath('../src/splash/splash.html'));
}

export function createSplashWindow(
  version: string,
  options: SplashWindowOptions = {},
): BrowserWindow {
  const preview = Boolean(options.preview);
  const win = new BrowserWindow({
    ...splashWindowDefaults,
    ...windowIconOption(),
    alwaysOnTop: preview ? false : splashWindowDefaults.alwaysOnTop,
    skipTaskbar: preview ? false : splashWindowDefaults.skipTaskbar,
    movable: preview ? true : splashWindowDefaults.movable,
    webPreferences: {
      ...sandboxedWebPreferences,
    },
  });
  applyWindowIcon(win);
  guardWorkbenchContents(win.webContents);
  win.center();
  win.show();
  win.focus();
  const query: Record<string, string> = { version };
  if (preview) {
    query['preview'] = '1';
  }
  void win.loadFile(resolveSplashHtmlPath(), { query });
  return win;
}

export function setSplashStatus(win: BrowserWindow | null, status: string): void {
  if (!win || win.isDestroyed()) {
    return;
  }
  const safe = status.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  void win.webContents.executeJavaScript(
    `var n=document.getElementById('tx-splash-status'); if(n) n.textContent='${safe}';`,
  );
}

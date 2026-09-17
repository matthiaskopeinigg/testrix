import { BrowserWindow } from 'electron';

import {
  bundledPath,
  mainWindowDefaults,
  resolveDevServerOrigin,
  sandboxedWebPreferences,
  usesAngularDevServer,
  windowIconOption,
} from '@testrix/electron-core';

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...mainWindowDefaults,
    ...windowIconOption(),
    webPreferences: {
      ...sandboxedWebPreferences,
      preload: bundledPath('preload/main.preload.cjs'),
    },
  });
  return win;
}

export function loadMainWindowContent(win: BrowserWindow): void {
  if (usesAngularDevServer()) {
    void win.loadURL(resolveDevServerOrigin());
    return;
  }
  void win.loadFile(bundledPath('../../renderer/dist/renderer/browser/index.html'));
}

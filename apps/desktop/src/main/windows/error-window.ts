import { app, BrowserWindow, ipcMain } from 'electron';

import { IpcChannels } from '@testrix/contracts';
import {
  applyWindowIcon,
  bundledPath,
  errorWindowDefaults,
  resolveExtraResource,
  sandboxedWebPreferences,
  windowIconOption,
  type TestrixError,
} from '@testrix/electron-core';

import { createIpcHandle } from '../ipc/ipc-handle';
import { guardWorkbenchContents } from './web-contents-guard';

export type ErrorWindowKind = 'boot' | 'app';

export interface ErrorWindowOptions {
  readonly kind: ErrorWindowKind;
  readonly error: TestrixError;
  readonly version: string;
  readonly preview?: boolean;
}

let errorWindow: BrowserWindow | null = null;
let errorIpcRegistered = false;

function resolveErrorHtmlPath(): string {
  if (process.env['TESTRIX_ERROR_HTML']) {
    return process.env['TESTRIX_ERROR_HTML'];
  }
  return resolveExtraResource('error/error.html', bundledPath('../src/error/error.html'));
}

function registerErrorIpc(getWindow: () => BrowserWindow | null): void {
  if (errorIpcRegistered) {
    return;
  }
  errorIpcRegistered = true;
  const handle = createIpcHandle(ipcMain);

  handle(IpcChannels.errorQuit, [], () => {
    app.quit();
  });

  handle(IpcChannels.errorRelaunch, [], () => {
    const win = getWindow();
    if (process.env['TESTRIX_PREVIEW'] && win && !win.isDestroyed()) {
      win.reload();
      return;
    }
    app.relaunch();
    app.quit();
  });
}

/**
 * Shows the static boot or application error card. Replaces any existing error window.
 */
export function createErrorWindow(options: ErrorWindowOptions): BrowserWindow {
  registerErrorIpc(() => errorWindow);

  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.destroy();
  }

  const win = new BrowserWindow({
    ...errorWindowDefaults,
    ...windowIconOption(),
    skipTaskbar: false,
    webPreferences: {
      ...sandboxedWebPreferences,
      preload: bundledPath('preload/error.preload.cjs'),
    },
  });
  applyWindowIcon(win);

  guardWorkbenchContents(win.webContents);
  errorWindow = win;
  win.on('closed', () => {
    if (errorWindow === win) {
      errorWindow = null;
    }
  });

  const query: Record<string, string> = {
    kind: options.kind,
    code: options.error.code,
    message: options.error.userMessage,
    version: options.version,
  };
  if (options.preview) {
    query['preview'] = '1';
  }

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  void win.loadFile(resolveErrorHtmlPath(), { query });
  return win;
}

export const SAMPLE_BOOT_ERROR: TestrixError = {
  code: 'APP_BOOT_TIMEOUT',
  userMessage: 'Testrix did not finish loading. Retry, or quit and try again.',
};

export const SAMPLE_APP_ERROR: TestrixError = {
  code: 'APP_RENDERER_CRASH',
  userMessage: 'The window closed unexpectedly. Local files on this PC were not removed.',
};

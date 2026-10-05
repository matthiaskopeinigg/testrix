import { BrowserWindow } from 'electron';

import {
  appLogger,
  applyWindowIcon,
  bundledPath,
  mainWindowDefaults,
  resolveDevServerOrigin,
  resolveExtraResource,
  sandboxedWebPreferences,
  usesAngularDevServer,
  windowIconOption,
} from '@testrix/electron-core';

import { guardWorkbenchContents } from './web-contents-guard';

const workbenchWindows = new Set<BrowserWindow>();

export function createMainWindow(): BrowserWindow {
  const preload = bundledPath('preload/main.preload.cjs');
  const win = new BrowserWindow({
    ...mainWindowDefaults,
    ...windowIconOption(),
    webPreferences: {
      ...sandboxedWebPreferences,
      preload,
    },
  });
  applyWindowIcon(win);
  guardWorkbenchContents(win.webContents);
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    appLogger.error(`preload ${preloadPath}`, error);
  });
  workbenchWindows.add(win);
  win.on('closed', () => {
    workbenchWindows.delete(win);
  });
  return win;
}

export function loadMainWindowContent(win: BrowserWindow): void {
  if (usesAngularDevServer()) {
    void win.loadURL(resolveDevServerOrigin());
    return;
  }
  void win.loadFile(resolveRendererHtmlPath());
}

/** Packaged extraResources land in `resources/browser`; unpackaged uses the Angular dist. */
export function resolveRendererHtmlPath(): string {
  return resolveExtraResource(
    'browser/index.html',
    bundledPath('../../renderer/dist/renderer/browser/index.html'),
  );
}

/** Opens another workbench window on the same userData / workspace files. */
export function openWorkbenchWindow(): BrowserWindow {
  const win = createMainWindow();
  loadMainWindowContent(win);
  return win;
}

export function listWorkbenchWindows(): readonly BrowserWindow[] {
  return [...workbenchWindows].filter((win) => !win.isDestroyed());
}

export function primaryWorkbenchWindow(): BrowserWindow | null {
  const open = listWorkbenchWindows();
  return open[0] ?? null;
}

export function focusedWorkbenchWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && workbenchWindows.has(focused) && !focused.isDestroyed()) return focused;
  return primaryWorkbenchWindow();
}

export function broadcastToWorkbenchWindows(channel: string, payload?: unknown): void {
  for (const win of listWorkbenchWindows()) {
    try {
      win.webContents.send(channel, payload);
    } catch {
      // window may be closing
    }
  }
}

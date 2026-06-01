import { BrowserWindow } from 'electron';

import type { SessionFile } from '../../../shared/config';

import { attachWin32DevToolsGuard } from './win32-devtools-guard';

import { resolveDevServerOrigin } from '../../boot/wait-for-dev-server';
import { appIconBrowserWindowOptions } from '../../config/app-icon';
import { resolvePackagedBrowserIndexUrl } from '../../config/browser-protocol';
import { shouldShowSplashBoot, usesAngularDevServer } from '../../config/environment';
import { resolveMainPreloadPath } from '../../config/paths';
import type { ConfigFileService } from '../../services/config/config-file.service';

import { bootThemeAdditionalArguments } from '../../config/boot-theme';
import { resolveBootWindowBackgroundColor } from '../../config/window-background';
import { MAIN_WINDOW_TRANSPARENT_BG, mainWindowChromeOptions } from './main-window-chrome';
import { mainWindowDefaults } from './main-window.options';
import { attachWindowChromeState } from './window-chrome-state';
import { attachExternalLinkHandlers } from './external-link-handlers';
import { attachWindowSessionSync } from './window-session-sync';

function mergeSessionBounds(defaults: typeof mainWindowDefaults, windowBounds: SessionFile['window']) {
  return {
    ...defaults,
    width: Math.max(defaults.minWidth ?? 800, windowBounds.width),
    height: Math.max(defaults.minHeight ?? 600, windowBounds.height),
    ...(windowBounds.x !== null && windowBounds.y !== null ? { x: windowBounds.x, y: windowBounds.y } : {}),
  };
}

/** Win32 dev without splash: show immediately — hide/show handoff breaks mouse input. */
export function usesWin32DirectShow(): boolean {
  return process.platform === 'win32' && usesAngularDevServer() && !shouldShowSplashBoot();
}

export function loadMainWindowContent(win: BrowserWindow): void {
  if (usesAngularDevServer()) {
    void win.loadURL(resolveDevServerOrigin());
    return;
  }
  void win.loadURL(resolvePackagedBrowserIndexUrl());
}

export function createMainWindow(
  session: SessionFile,
  files: ConfigFileService,
  opts?: { readonly deferNavigation?: boolean },
): BrowserWindow {
  const merged = mergeSessionBounds(mainWindowDefaults, session.window);
  const win32DirectShow = usesWin32DirectShow();

  const chrome = mainWindowChromeOptions();
  const windowBackground =
    chrome.transparent === false ? resolveBootWindowBackgroundColor() : MAIN_WINDOW_TRANSPARENT_BG;
  const deferShowUntilHandoff = shouldShowSplashBoot();
  const win = new BrowserWindow({
    ...merged,
    ...chrome,
    ...appIconBrowserWindowOptions(),
    show: win32DirectShow,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.platform === 'win32' ? false : !win32DirectShow,
      backgroundThrottling: false,
      preload: resolveMainPreloadPath(),
      additionalArguments: [...bootThemeAdditionalArguments()],
    },
  });

  if (!win.isDestroyed()) {
    win.setBackgroundColor(windowBackground);
    win.setIgnoreMouseEvents(false);
  }

  attachWindowSessionSync(win, files);
  attachWindowChromeState(win);
  attachExternalLinkHandlers(win);
  attachWin32DevToolsGuard(win);

  if (!win32DirectShow || deferShowUntilHandoff) {
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) {
        return;
      }
      win.setBackgroundColor(windowBackground);
      win.setIgnoreMouseEvents(false);
      if (session.window.maximized) {
        win.maximize();
      }
      if (!deferShowUntilHandoff && !win32DirectShow) {
        win.show();
      }
    });
  } else if (session.window.maximized) {
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) {
        win.maximize();
      }
    });
  }

  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.setIgnoreMouseEvents(false);
    }
  });

  if (!(opts?.deferNavigation === true)) {
    loadMainWindowContent(win);
  }

  return win;
}

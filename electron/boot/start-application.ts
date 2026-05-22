import { app, BrowserWindow, globalShortcut, ipcMain, session } from 'electron';

import { AppReadyCoordinator } from './app-ready-coordinator';

import { isDevMode, shouldShowSplashBoot, usesAngularDevServer } from '../config/environment';
import { attachProcessLogging, logDebug, logError } from '../errors/logger';
import { registerAllIpcHandlers } from '../ipc/register-ipc';
import { closeDatabaseConnections } from '../ipc/handlers/db.handler';
import { resolveAndPrepareProfileLayout } from '../services/config/config-bootstrap.service';
import { ConfigFileService } from '../services/config/config-file.service';
import { ConfigPathService } from '../services/config/config-path.service';
import { ProfileConfigService } from '../services/config/profile-config.service';
import { createErrorWindow } from '../windows/error-window/error-window.factory';
import { getMainSettings } from '../services/settings-runtime';
import { getUpdaterService } from '../services/updater/updater.service';
import { createMainWindow, loadMainWindowContent, usesWin32DirectShow } from '../windows/main-window/main-window.factory';
import { createSplashWindow } from '../windows/splash-window/splash-window.factory';
import { resolveDevServerOrigin, waitForDevServerReady } from './wait-for-dev-server';

import { ErrorCodes, TestrixError } from '../../shared/errors';
import { cookieJarStore } from '../services/http/cookie-jar.service';

/** Chromium net errors that are normal during `ng serve` boot/HMR — must not tear down splash. */
function isIgnorableRendererLoadError(errorCode: number): boolean {
  return errorCode === -3 || errorCode === -27 || errorCode === -102;
}

function buildDevConnectSrc(origin: string): string {
  const devUrl = new URL(origin);
  const port = devUrl.port || (devUrl.protocol === 'https:' ? '443' : '80');
  const hosts = devUrl.hostname === 'localhost' ? ['localhost', '127.0.0.1'] : [devUrl.hostname];
  const httpHosts = hosts.map((host) => `http://${host}:${port}`).join(' ');
  const wsHosts = hosts.map((host) => `ws://${host}:${port}`).join(' ');
  return `'self' ${httpHosts} ${wsHosts}`;
}

function attachDefaultCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const existing = details.responseHeaders ?? {};

    const urlLower = details.url.toLowerCase();
    if (
      urlLower.startsWith('file://') ||
      urlLower.startsWith('devtools://') ||
      urlLower.startsWith('chrome-extension://')
    ) {
      callback({ responseHeaders: existing });
      return;
    }

    const githubConnect =
      "https://api.github.com https://*.githubusercontent.com https://github.com";
    const connectSrc = usesAngularDevServer()
      ? `${buildDevConnectSrc(resolveDevServerOrigin())} ${githubConnect}`.trim()
      : `'self' ${githubConnect}`;
    const fontStyleSrc = "'self' 'unsafe-inline' https://fonts.googleapis.com";
    const fontSrc = "'self' https://fonts.gstatic.com data:";
    const csp = usesAngularDevServer()
      ? `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src ${fontStyleSrc}; font-src ${fontSrc}; img-src 'self' data: blob:; connect-src ${connectSrc}; worker-src 'self' blob:`
      : `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src ${fontStyleSrc}; font-src ${fontSrc}; img-src 'self' data: blob:`;
    callback({
      responseHeaders: {
        ...existing,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function resolveBootSplash(getBootSplash?: () => BrowserWindow | null): BrowserWindow | null {
  const existing = getBootSplash?.() ?? null;
  if (existing && !existing.isDestroyed()) {
    return existing;
  }
  if (!shouldShowSplashBoot()) {
    return null;
  }
  try {
    return createSplashWindow();
  } catch (e: unknown) {
    console.error('[electron] splash bootstrap failed:', e);
    return null;
  }
}

export async function startApplication(getBootSplash?: () => BrowserWindow | null): Promise<void> {
  // Win32: fixes mouse input in embedded Chromium (occlusion + GPU compositing vs normal browser).
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let mainWindowRef: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (!mainWindowRef || mainWindowRef.isDestroyed()) {
      return;
    }
    if (mainWindowRef.isMinimized()) {
      mainWindowRef.restore();
    }
    mainWindowRef.focus();
  });

  await app.whenReady();

  const splashWindow = resolveBootSplash(getBootSplash);

  attachProcessLogging((name) => app.getPath(name));
  attachDefaultCsp();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  const pathsSvc = new ConfigPathService(app.getPath.bind(app));

  try {
    const layout = await resolveAndPrepareProfileLayout(pathsSvc);

    let anchorRef = layout.anchor;
    let activeProfileDirRef = layout.activeProfileDir;
    let sharedConfigDirRef = layout.sharedConfigDir;
    const files = new ConfigFileService(
      app.getPath.bind(app),
      () => sharedConfigDirRef,
      () => activeProfileDirRef,
    );

    await files.ensureProfileWorkspaceDefaults(activeProfileDirRef);

    await files.readSession();
    await files.readSettings();

    const sessionData = await files.readSession();

    const mainWindow = createMainWindow(sessionData, files, { deferNavigation: true });
    mainWindowRef = mainWindow;
    if (!usesWin32DirectShow() && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.hide();
    }

    if (isDevMode()) {
      const toggleDevTools = (): void => {
        if (mainWindow.isDestroyed()) {
          return;
        }
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
          return;
        }
        // Win32: never use detached DevTools — it blocks all app clicks.
        mainWindow.webContents.openDevTools({
          mode: process.platform === 'win32' ? 'right' : 'detach',
          activate: process.platform !== 'win32',
        });
      };
      globalShortcut.register('F12', toggleDevTools);
      globalShortcut.register('CommandOrControl+Shift+I', toggleDevTools);
      app.once('will-quit', () => {
        globalShortcut.unregisterAll();
        void closeDatabaseConnections();
      });
    }

    const coordinator = new AppReadyCoordinator({
      showSplash: Boolean(splashWindow),
      minSplashMs: 600,
      bootTimeoutMs: usesAngularDevServer() ? 120_000 : 45_000,
      splashWindow,
      mainWindow,
      onBootFailure: (err: TestrixError) => {
        logError(app.getPath.bind(app), 'boot failure', err);
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy();
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
        void createErrorWindow(err.userMessage, mainWindow.isDestroyed() ? undefined : mainWindow);
      },
    });

    const profiles = new ProfileConfigService({
      paths: pathsSvc,
      files,
      getAnchor: () => anchorRef,
      setAnchor: async (next) => {
        anchorRef = next;
        await pathsSvc.writeAnchor(next);
      },
      getActiveProfileDir: () => activeProfileDirRef,
      setActiveProfileDirRef: (next) => {
        activeProfileDirRef = next;
        void cookieJarStore.loadForProfile(next);
      },
    });

    registerAllIpcHandlers(ipcMain, app, coordinator, {
      paths: pathsSvc,
      files,
      profiles,
      getConfigDir: () => activeProfileDirRef,
      setConfigDirRef: (next) => {
        activeProfileDirRef = next;
        void cookieJarStore.loadForProfile(next);
      },
      getSharedConfigDir: () => sharedConfigDirRef,
      setSharedConfigDirRef: (next) => {
        sharedConfigDirRef = next;
      },
    });

    getUpdaterService().init({
      getMainWindow: () => (mainWindow.isDestroyed() ? null : mainWindow),
      getConfigDir: () => activeProfileDirRef,
      readSettings: () => getMainSettings(),
    });

    /** Document loaded in the hidden window — not shown until `markAngularReady()` after first paint. */
    mainWindow.webContents.once('did-finish-load', () => {
      coordinator.markMainLoadFinished();
      const scheduleBootFallback = (ms: number): void => {
        setTimeout(() => {
          if (coordinator.hasFinished()) {
            return;
          }
          logDebug(`[boot] main-process fallback at ${ms}ms (renderer notifyReady pending)`);
          coordinator.markAngularReady();
        }, ms);
      };
      // Renderer calls notifyReady after shell paints; fallback only if IPC never arrives.
      scheduleBootFallback(usesAngularDevServer() ? 15_000 : 12_000);
    });

    mainWindow.webContents.on('did-fail-load', (_e, errorCode, description, _validatedUrl, isMainFrame) => {
      if (!isMainFrame || isIgnorableRendererLoadError(errorCode)) {
        return;
      }
      coordinator.failBoot(
        new TestrixError(
          ErrorCodes.APP_LOAD_FAILED,
          `Unable to load the application (${String(errorCode)}: ${description}).`,
        ),
      );
    });

    if (usesAngularDevServer()) {
      const devOrigin = resolveDevServerOrigin();
      const devServerUp = await waitForDevServerReady(devOrigin, 120_000);
      if (!devServerUp) {
        coordinator.failBoot(
          new TestrixError(
            ErrorCodes.APP_BOOT_TIMEOUT,
            `Angular dev server at ${devOrigin} did not become reachable in time.`,
          ),
        );
        return;
      }
    }

    coordinator.armBootTimeout();
    loadMainWindowContent(mainWindow);
  } catch (e: unknown) {
    logError(app.getPath.bind(app), 'fatal boot error', e);
    mainWindowRef = null;
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
    void createErrorWindow('Testrix cannot start due to an internal failure while preparing configuration.');
  }
}

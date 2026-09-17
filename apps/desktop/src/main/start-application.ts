import { app, BrowserWindow, ipcMain, nativeTheme, session } from 'electron';
import os from 'node:os';
import path from 'node:path';

import {
  AppError,
  AppReadyCoordinator,
  attachDefaultCsp,
  logError,
  resolveDevServerOrigin,
  shouldShowSplashBoot,
  usesAngularDevServer,
  type TestrixError,
} from '@testrix/electron-core';
import { flattenDatabaseConnections } from '@testrix/contracts';

import { applyLogger, registerIpc } from './ipc/register-ipc';
import { resolveDesktopPreviewSurface } from './preview-surface';
import { ConfigStore } from './services/config.service';
import { DatabaseHost } from './services/database/database-host.service';
import {
  createErrorWindow,
  SAMPLE_APP_ERROR,
  SAMPLE_BOOT_ERROR,
} from './windows/error-window';
import { createMainWindow, loadMainWindowContent } from './windows/main-window';
import { createSplashWindow, setSplashStatus } from './windows/splash-window';

async function waitForDevServer(origin: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(origin, { method: 'HEAD' });
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

function isTestrixError(value: unknown): value is TestrixError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'userMessage' in value &&
    typeof (value as TestrixError).code === 'string' &&
    typeof (value as TestrixError).userMessage === 'string'
  );
}

function toTestrixError(error: unknown, fallbackCode: string, fallbackMessage: string): TestrixError {
  if (error instanceof AppError || isTestrixError(error)) {
    return error;
  }
  return {
    code: fallbackCode,
    userMessage: error instanceof Error ? error.message : fallbackMessage,
  };
}

function showPreviewSurface(surface: ReturnType<typeof resolveDesktopPreviewSurface>): boolean {
  if (!surface) {
    return false;
  }

  const version = app.getVersion();
  if (surface === 'splash') {
    const splash = createSplashWindow(version, { preview: true });
    setSplashStatus(splash, 'Starting…');
    return true;
  }
  if (surface === 'boot-error') {
    createErrorWindow({
      kind: 'boot',
      error: SAMPLE_BOOT_ERROR,
      version,
      preview: true,
    });
    return true;
  }
  createErrorWindow({
    kind: 'app',
    error: SAMPLE_APP_ERROR,
    version,
    preview: true,
  });
  return true;
}

export async function startApplication(): Promise<void> {
  const previewSurface = resolveDesktopPreviewSurface();
  if (!previewSurface && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  if (previewSurface) {
    app.setPath('userData', path.join(os.tmpdir(), `testrix-preview-${previewSurface}`));
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
  session.defaultSession.setSpellCheckerEnabled(false);

  if (showPreviewSurface(previewSurface)) {
    app.on('window-all-closed', () => app.quit());
    return;
  }

  const connectSrc = usesAngularDevServer()
    ? `'self' ${resolveDevServerOrigin()} ws://localhost:4200 ws://127.0.0.1:4200 http://127.0.0.1:4200`
    : `'self'`;
  attachDefaultCsp(session.defaultSession, { connectSrc });

  const splash = shouldShowSplashBoot() ? createSplashWindow(app.getVersion()) : null;
  setSplashStatus(splash, 'Preparing workspace…');

  const store = new ConfigStore(app);
  await store.load();
  nativeTheme.themeSource = store.settings.theme === 'system' ? 'system' : store.settings.theme;
  applyLogger(store);

  const database = new DatabaseHost();
  database.configure({
    idleMinutes: () => store.settings.database.idleDisconnectMinutes,
    rollbackSeconds: () => store.settings.database.uncommittedRollbackSeconds,
  });
  if (store.settings.database.connectOnStartup) {
    void database.warmBoot(flattenDatabaseConnections(store.databases.nodes));
  }
  app.on('before-quit', () => {
    void database.closeAll();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  const showBootError = (error: unknown): void => {
    const testrixError = toTestrixError(error, 'APP_BOOT_FAILURE', 'Testrix could not start.');
    logError(app.getPath.bind(app), 'boot', error);
    if (splash && !splash.isDestroyed()) {
      splash.destroy();
    }
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.destroy();
      mainWindowRef = null;
    }
    createErrorWindow({
      kind: 'boot',
      error: testrixError,
      version: app.getVersion(),
    });
  };

  const showAppError = (error: unknown): void => {
    const testrixError = toTestrixError(
      error,
      'APP_RENDERER_CRASH',
      'The window closed unexpectedly. Local files on this PC were not removed.',
    );
    logError(app.getPath.bind(app), 'runtime', error);
    createErrorWindow({
      kind: 'app',
      error: testrixError,
      version: app.getVersion(),
    });
  };

  try {
    const mainWindow = createMainWindow();
    mainWindowRef = mainWindow;

    const coordinator = new AppReadyCoordinator({
      showSplash: Boolean(splash),
      minSplashMs: 900,
      bootTimeoutMs: usesAngularDevServer() ? 120_000 : 45_000,
      splashWindow: splash,
      mainWindow,
      onBootFailure: (error) => {
        showBootError(error);
      },
    });

    registerIpc(ipcMain, {
      app,
      getMainWindow: () => (mainWindow.isDestroyed() ? null : mainWindow),
      store,
      database,
      coordinator,
    });

    mainWindow.webContents.once('did-finish-load', () => {
      coordinator.markMainLoadFinished();
      setTimeout(() => {
        if (!coordinator.hasFinished()) {
          coordinator.markAngularReady();
        }
      }, usesAngularDevServer() ? 15_000 : 8_000);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') {
        return;
      }
      if (!coordinator.hasFinished()) {
        coordinator.failBoot(
          new AppError('APP_RENDERER_CRASH', 'The workbench stopped before it finished starting.'),
        );
        return;
      }
      showAppError(new AppError('APP_RENDERER_CRASH', 'The window closed unexpectedly. Local files on this PC were not removed.'));
    });

    if (usesAngularDevServer()) {
      setSplashStatus(splash, 'Starting interface…');
      const ready = await waitForDevServer(resolveDevServerOrigin(), 120_000);
      if (!ready) {
        coordinator.failBoot(new AppError('APP_BOOT_TIMEOUT', 'Angular dev server did not start in time.'));
        return;
      }
    } else {
      setSplashStatus(splash, 'Starting interface…');
    }

    coordinator.armBootTimeout();
    loadMainWindowContent(mainWindow);
  } catch (error) {
    showBootError(error);
  }
}

import { app, BrowserWindow, ipcMain, nativeTheme, session } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AppError,
  AppReadyCoordinator,
  attachDefaultCsp,
  logError,
  resolveDevServerOrigin,
  resolveWindowIcon,
  shouldShowSplashBoot,
  usesAngularDevServer,
  userDataOverride,
  type TestrixError,
} from '@testrix/electron-core';
import {
  COPYRIGHT,
  flattenDatabaseConnections,
  IpcChannels,
  isAllowedUpdateUrl,
  PUBLISHER_NAME,
  UPDATE_PUBLIC_KEY,
  UPDATE_REPOSITORY,
  updateManifestUrl,
} from '@testrix/contracts';

import { applyLogger, registerIpc } from './ipc/register-ipc';
import { detach, runShutdownSteps } from './lifecycle';
import { resolveDesktopPreviewSurface } from './preview-surface';
import { ConfigStore } from './services/config.service';
import { DatabaseHost } from './services/database/database-host.service';
import { HttpHost } from './services/http-host.service';
import { TestingRuntime } from './services/testing/testing-runtime';
import { WebsocketHost } from './services/websocket-host.service';
import { WorkspacePackHost } from './services/workspace-pack-host.service';
import { CollabCredentialVault } from './services/collab/collab-credential-vault';
import { CollabHost } from './services/collab/collab-host.service';
import { GitCli } from './services/collab/git-cli';
import { WorkspaceGitHost } from './services/collab/workspace-git-host.service';
import {
  readArgValue,
  readDevUpdateFeed,
  resolveUpdateSupport,
  UpdateHost,
} from './services/update/update-host.service';
import { createErrorWindow, SAMPLE_APP_ERROR, SAMPLE_BOOT_ERROR } from './windows/error-window';
import { installApplicationMenu } from './windows/application-menu';
import { watchDevOverlayReload } from './windows/dev-overlay-reload';
import {
  createMainWindow,
  loadMainWindowContent,
  openWorkbenchWindow,
  primaryWorkbenchWindow,
  broadcastToWorkbenchWindows,
} from './windows/main-window';
import { createSplashWindow, setSplashStatus } from './windows/splash-window';
import { installWorkbenchPermissions } from './windows/web-contents-guard';

/** Long enough for collab to push lock releases on a slow network. */
const SHUTDOWN_TIMEOUT_MS = 8000;

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

function toTestrixError(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): TestrixError {
  if (error instanceof AppError || isTestrixError(error)) {
    return error;
  }
  return {
    code: fallbackCode,
    userMessage: error instanceof Error ? error.message : fallbackMessage,
  };
}

/**
 * Starts Setup in its own process and waits until the OS has spawned it.
 * Hiding the window would also hide the portable extractor and the update UI.
 */
function launchDetachedInstaller(exe: string, args: readonly string[]): Promise<void> {
  const stub = process.env['TESTRIX_UPDATE_STUB_INSTALLER'];
  const setupMain = process.env['TESTRIX_UPDATE_SETUP_MAIN'];
  const env = { ...process.env };
  delete env['ELECTRON_RUN_AS_NODE'];
  delete env['ELECTRON_NO_ASAR'];
  delete env['TESTRIX_UPDATE_FEED'];
  delete env['TESTRIX_UPDATE_PUBLIC_KEY'];
  delete env['TESTRIX_UPDATE_STUB_INSTALLER'];
  delete env['TESTRIX_UPDATE_SETUP_MAIN'];
  delete env['TESTRIX_UPDATE_INSTALL_DIR'];
  delete env['TESTRIX_USER_DATA_DIR'];
  env['TESTRIX_SILENT_UPDATE'] = '1';
  env['TESTRIX_PAYLOAD_FILE'] = exe;
  const setupDir = setupMain ? path.resolve(path.dirname(setupMain), '..') : undefined;
  // Electron swallows `--foo` as Chromium switches unless they come after `--`.
  const command = stub || setupMain ? process.execPath : exe;
  const commandArgs = stub
    ? [stub, ...args]
    : setupMain && setupDir
      ? [setupDir, '--', ...args]
      : [...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: Boolean(stub),
      env,
      cwd: setupDir,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Hide workbench windows so quit does not look like a freeze while Setup starts. */
function hideWorkbenchWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.hide();
  }
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
  const localFeed = readDevUpdateFeed(process.env, app.isPackaged);
  if (localFeed?.setupMain && !process.env['TESTRIX_UPDATE_SETUP_MAIN'])
    process.env['TESTRIX_UPDATE_SETUP_MAIN'] = localFeed.setupMain;
  const userData = userDataOverride() ?? localFeed?.profileDir ?? null;
  if (userData) {
    const resolved = path.resolve(userData);
    mkdirSync(resolved, { recursive: true });
    app.setPath('userData', resolved);
  }
  if (!previewSurface && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  if (previewSurface) {
    app.setPath('userData', path.join(os.tmpdir(), `testrix-preview-${previewSurface}`));
  }

  let mainWindowRef: BrowserWindow | null = null;
  let collabRef: CollabHost | null = null;

  app.on('second-instance', () => {
    const primary = primaryWorkbenchWindow() ?? mainWindowRef;
    if (!primary || primary.isDestroyed()) {
      return;
    }
    if (primary.isMinimized()) {
      primary.restore();
    }
    primary.focus();
  });

  await app.whenReady();
  const brandIcon = resolveWindowIcon();
  if (brandIcon && process.platform === 'darwin' && app.dock) app.dock.setIcon(brandIcon);
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    copyright: COPYRIGHT,
    version: app.getVersion(),
    authors: [PUBLISHER_NAME],
  });
  session.defaultSession.setSpellCheckerEnabled(false);
  installWorkbenchPermissions(session.defaultSession);

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
  const http = new HttpHost();
  const websocket = new WebsocketHost((event) => {
    const win = mainWindowRef;
    if (win && !win.isDestroyed()) win.webContents.send(IpcChannels.websocketEvent, event);
  });
  const workspacePack = new WorkspacePackHost(
    store,
    () => mainWindowRef,
    () => app.getVersion(),
  );
  const collab = new CollabHost(
    store,
    new CollabCredentialVault(path.join(app.getPath('userData'), 'collab-vault.bin')),
    new WorkspaceGitHost(new GitCli()),
    (channel, payload) => broadcastToWorkbenchWindows(channel, payload),
  );
  collabRef = collab;
  store.onWorkspaceFilesChanged = () => {
    broadcastToWorkbenchWindows(IpcChannels.workspaceFilesChanged);
    collab.schedule();
  };
  collab.start();
  const testing = new TestingRuntime({
    store,
    http,
    database,
    getMainWindow: () => mainWindowRef,
    broadcast: (channel, payload) => broadcastToWorkbenchWindows(channel, payload),
  });
  testing.start();
  database.configure({
    idleMinutes: () => store.settings.database.idleDisconnectMinutes,
    rollbackSeconds: () => store.settings.database.uncommittedRollbackSeconds,
  });
  const feed = localFeed;
  const support = feed
    ? { installDir: feed.installDir, reason: null }
    : resolveUpdateSupport({
        platform: process.platform,
        isPackaged: app.isPackaged,
        execPath: process.execPath,
        env: process.env,
      });
  const updates = new UpdateHost({
    currentVersion: app.getVersion(),
    updatesDir: path.resolve(app.getPath('userData'), 'updates'),
    installDir: support.installDir,
    unsupportedReason: support.reason,
    publicKey: feed?.publicKey ?? UPDATE_PUBLIC_KEY,
    repository: UPDATE_REPOSITORY,
    manifestUrl: feed
      ? (channel) => updateManifestUrl(channel, UPDATE_REPOSITORY, feed.origin)
      : undefined,
    isAllowedUrl: feed
      ? (url) => url === feed.origin || url.startsWith(`${feed.origin}/`) || isAllowedUpdateUrl(url)
      : undefined,
    readPrefs: () => store.settings.updates,
    writePrefs: async (prefs) => {
      await store.patchSettings({ updates: prefs });
    },
    publish: (status) => broadcastToWorkbenchWindows(IpcChannels.updateStatus, status),
    fetch: (url, init) => fetch(url, init),
    launchInstaller: (exe, args) => launchDetachedInstaller(exe, args),
    quit: () => {
      hideWorkbenchWindows();
      app.quit();
    },
    pid: process.pid,
    updatedFrom: readArgValue(process.argv, 'updated-from'),
  });
  detach(
    'updates:start',
    updates.start().then(() => (feed ? updates.check() : undefined)),
  );
  if (store.settings.database.connectOnStartup)
    detach(
      'database:warm-boot',
      database.warmBoot(flattenDatabaseConnections(store.databases.nodes)),
    );
  let isQuitting = false;
  app.on('before-quit', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    void runShutdownSteps(
      [
        { name: 'updates', run: () => updates.stop() },
        { name: 'collab', run: () => collabRef?.stop() },
        { name: 'testing', run: () => testing.shutdown() },
        { name: 'database', run: () => database.closeAll() },
        { name: 'websocket', run: () => websocket.closeAll() },
      ],
      SHUTDOWN_TIMEOUT_MS,
    ).finally(() => app.quit());
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
    watchDevOverlayReload();

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
      getMainWindow: () =>
        primaryWorkbenchWindow() ?? (mainWindow.isDestroyed() ? null : mainWindow),
      openWorkbenchWindow: () => {
        const win = openWorkbenchWindow();
        mainWindowRef = primaryWorkbenchWindow() ?? win;
        return win;
      },
      store,
      database,
      http,
      websocket,
      testing,
      coordinator,
      workspacePack,
      collab,
      updates,
    });

    installApplicationMenu({
      openWorkbenchWindow: () => {
        const win = openWorkbenchWindow();
        mainWindowRef = primaryWorkbenchWindow() ?? win;
        return win;
      },
    });

    mainWindow.webContents.once('did-finish-load', () => {
      coordinator.markMainLoadFinished();
      setTimeout(
        () => {
          if (!coordinator.hasFinished()) {
            coordinator.markAngularReady();
          }
        },
        usesAngularDevServer() ? 15_000 : 8_000,
      );
    });
    mainWindow.webContents.once('did-fail-load', (_event, _code, description) => {
      if (coordinator.hasFinished()) return;
      coordinator.failBoot(
        new AppError(
          'APP_BOOT_TIMEOUT',
          `The workbench page did not load (${description || 'unknown error'}).`,
        ),
      );
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
      showAppError(
        new AppError(
          'APP_RENDERER_CRASH',
          'The window closed unexpectedly. Local files on this PC were not removed.',
        ),
      );
    });

    if (usesAngularDevServer()) {
      setSplashStatus(splash, 'Starting interface…');
      const ready = await waitForDevServer(resolveDevServerOrigin(), 120_000);
      if (!ready) {
        coordinator.failBoot(
          new AppError('APP_BOOT_TIMEOUT', 'Angular dev server did not start in time.'),
        );
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

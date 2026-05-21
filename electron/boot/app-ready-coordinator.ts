import { BrowserWindow } from 'electron';

import { ErrorCodes, TestrixError } from '../../shared/errors';

import { isDevMode } from '../config/environment';
import { logDebug } from '../errors/logger';
import { destroyOrphanDevToolsWindows } from '../windows/main-window/win32-devtools-guard';

export class AppReadyCoordinator {
  private mainLoaded = false;

  private angularReady = false;

  private minSplashElapsed = false;

  private finished = false;

  private bootTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly opts: {
      readonly showSplash: boolean;
      readonly minSplashMs: number;
      readonly bootTimeoutMs: number;
      readonly splashWindow: BrowserWindow | null;
      readonly mainWindow: BrowserWindow;
      readonly onBootFailure: (err: TestrixError) => void;
    },
  ) {
    if (this.opts.showSplash) {
      setTimeout(() => {
        this.minSplashElapsed = true;
        this.tryHandoff();
      }, this.opts.minSplashMs);
    } else {
      this.minSplashElapsed = true;
    }
  }

  /**
   * Starts the boot deadline after the dev server (if any) is up and the renderer URL is loading.
   * Avoids counting `ng serve` compile time against the Angular ready handshake.
   */
  armBootTimeout(): void {
    this.cancelBootTimer();
    this.bootTimer = setTimeout(() => {
      this.failBoot(
        new TestrixError(
          ErrorCodes.APP_BOOT_TIMEOUT,
          'The application took too long to start. Check the dev server or build output.',
        ),
      );
    }, this.opts.bootTimeoutMs);
  }

  markMainLoadFinished(): void {
    if (this.finished) {
      return;
    }
    this.mainLoaded = true;
    this.tryHandoff();
  }

  markAngularReady(): void {
    if (this.finished) {
      return;
    }
    this.angularReady = true;
    this.tryHandoff();
  }

  cancelBootTimer(): void {
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = undefined;
    }
  }

  /** True after successful handoff or `failBoot`. */
  hasFinished(): boolean {
    return this.finished;
  }

  /** Stops timers and notifies boot failure once (splash stays until error UI handles UX). */
  failBoot(err: TestrixError): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.cancelBootTimer();
    this.opts.onBootFailure(err);
  }

  private tryHandoff(): void {
    const needSplash = this.opts.showSplash;
    const minOk = needSplash ? this.minSplashElapsed : true;
    if (!this.angularReady || !this.mainLoaded || !minOk) {
      return;
    }
    this.finishSuccess();
  }

  private finishSuccess(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.cancelBootTimer();
    if (isDevMode()) {
      logDebug('[boot] finishSuccess');
    }
    dismissSplashWindow(this.opts.splashWindow);
    const mainWindow = this.opts.mainWindow;
    if (!mainWindow.isDestroyed()) {
      destroyOrphanDevToolsWindows(mainWindow);
      mainWindow.setIgnoreMouseEvents(false);
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
    if (isDevMode() && process.platform !== 'win32' && process.env.TESTRIX_AUTO_DEVTOOLS === '1') {
      setImmediate(() => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      });
    }
  }
}

/** Tear down splash so `alwaysOnTop` cannot leave a ghost window above the main shell. */
function dismissSplashWindow(splash: BrowserWindow | null): void {
  const candidates = new Set<BrowserWindow>();
  if (splash && !splash.isDestroyed()) {
    candidates.add(splash);
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) {
      continue;
    }
    if (win.isAlwaysOnTop()) {
      candidates.add(win);
      continue;
    }
    const title = win.getTitle().toLowerCase();
    if (title.includes('splash') || title.includes('testrix splash')) {
      candidates.add(win);
    }
  }
  for (const win of candidates) {
    if (win.isDestroyed()) {
      continue;
    }
    win.setAlwaysOnTop(false);
    win.hide();
    win.destroy();
  }
}

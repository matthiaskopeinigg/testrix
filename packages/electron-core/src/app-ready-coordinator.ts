import type { BrowserWindow } from 'electron';
import type { TestrixError } from './testrix-error';

export interface AppReadyCoordinatorOptions {
  readonly showSplash: boolean;
  readonly minSplashMs: number;
  readonly bootTimeoutMs: number;
  readonly splashWindow: BrowserWindow | null;
  readonly mainWindow: BrowserWindow;
  readonly onBootFailure: (error: TestrixError) => void;
}

/**
 * Coordinates splash lifetime against renderer first paint.
 */
export class AppReadyCoordinator {
  private finished = false;
  private mainLoaded = false;
  private angularReady = false;
  private readonly startedAt = Date.now();
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: AppReadyCoordinatorOptions) {}

  hasFinished(): boolean {
    return this.finished;
  }

  markMainLoadFinished(): void {
    this.mainLoaded = true;
    this.tryFinish();
  }

  markAngularReady(): void {
    this.angularReady = true;
    this.tryFinish();
  }

  armBootTimeout(): void {
    this.timeoutHandle = setTimeout(() => {
      if (this.finished) {
        return;
      }
      this.failBoot({
        code: 'APP_BOOT_TIMEOUT',
        userMessage: 'Testrix did not finish loading. Retry, or quit and try again.',
      });
    }, this.options.bootTimeoutMs);
  }

  failBoot(error: TestrixError): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.clearTimeout();
    this.options.onBootFailure(error);
  }

  private tryFinish(): void {
    if (this.finished || !this.mainLoaded || !this.angularReady) {
      return;
    }

    const elapsed = Date.now() - this.startedAt;
    const wait = this.options.showSplash
      ? Math.max(0, this.options.minSplashMs - elapsed)
      : 0;

    const reveal = (): void => {
      if (this.finished) {
        return;
      }
      this.finished = true;
      this.clearTimeout();
      const { splashWindow, mainWindow } = this.options;
      if (splashWindow && !splashWindow.isDestroyed()) {
        void splashWindow.webContents.executeJavaScript(
          "document.body.classList.add('is-leaving');",
        );
        setTimeout(() => {
          if (!splashWindow.isDestroyed()) {
            splashWindow.close();
          }
        }, 180);
      }
      if (!mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    };

    setTimeout(reveal, wait);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}

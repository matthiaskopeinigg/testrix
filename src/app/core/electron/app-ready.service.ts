import { Injectable, inject, DestroyRef } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ElectronService } from './electron.service';

const RETRY_INTERVAL_MS = 100;
const MAX_RETRY_ATTEMPTS = 60;
const SHELL_VISIBLE_DEADLINE_MS = 12_000;

/**
 * Signals Electron to close splash and show the main window after the shell route has painted.
 * Must run after router initial navigation — not during early APP_INITIALIZER.
 */

@Injectable({ providedIn: 'root' })
export class AppReadyService {
  private readonly electron = inject(ElectronService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private handshakeDone = false;
  private handoffStarted = false;
  private retryTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    const persistSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        void this.persistRoute(event);
      });
    this.destroyRef.onDestroy(() => {
      persistSub.unsubscribe();
      if (this.retryTimer !== undefined) {
        clearInterval(this.retryTimer);
        this.retryTimer = undefined;
      }
    });
  }

  /**
   * Closes the Electron splash once shell chrome has painted (see {@link ShellLayoutComponent}).
   */
  async completeBootstrapHandoff(opts?: { readonly fromShell?: boolean }): Promise<void> {
    if (this.handoffStarted || this.handshakeDone) {
      return;
    }
    this.handoffStarted = true;
    const t0 = performance.now();
    const shellWaitMs = opts?.fromShell
      ? await this.waitForNextPaint()
      : await this.waitForShellChromeVisible();
    this.logBoot('shell visible', {
      shellWaitMs,
      fromShell: opts?.fromShell ?? false,
      url: this.router.url,
      hasShell: !!document.querySelector('.tx-shell'),
      hasHome: !!document.querySelector('app-home'),
    });

    let attempts = 0;
    const tryNotify = async (): Promise<boolean> => {
      attempts += 1;
      this.logBoot('notifyReady invoke start', { attempts });
      const ok = this.invokeNotifyReady();
      if (ok) {
        this.logBoot('notifyReady succeeded', {
          attempts,
          ms: Math.round(performance.now() - t0),
        });
        if (this.retryTimer !== undefined) {
          clearInterval(this.retryTimer);
          this.retryTimer = undefined;
        }
        return true;
      }
      return false;
    };

    if (await tryNotify()) {
      return;
    }

    this.retryTimer = setInterval(() => {
      void (async () => {
        if (this.handshakeDone || attempts >= MAX_RETRY_ATTEMPTS) {
          if (this.retryTimer !== undefined) {
            clearInterval(this.retryTimer);
            this.retryTimer = undefined;
          }
          if (!this.handshakeDone) {
            this.logBoot('handoff gave up', { attempts, ms: Math.round(performance.now() - t0) });
          }
          return;
        }
        await tryNotify();
      })();
    }, RETRY_INTERVAL_MS);
  }

  private waitForNextPaint(): Promise<number> {
    const t0 = performance.now();
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(Math.round(performance.now() - t0)));
      });
    });
  }

  private waitForShellChromeVisible(): Promise<number> {
    const t0 = performance.now();
    return new Promise((resolve) => {
      const finish = (): void => {
        resolve(Math.round(performance.now() - t0));
      };
      const deadline = Date.now() + SHELL_VISIBLE_DEADLINE_MS;
      const tick = (): void => {
        if (document.querySelector('.tx-shell')) {
          requestAnimationFrame(() => requestAnimationFrame(finish));
          return;
        }
        if (Date.now() >= deadline) {
          finish();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  private invokeNotifyReady(): boolean {
    const bridge = this.electron.bridge();
    if (!bridge) {
      this.logBoot('bridge missing', {});
      return false;
    }

    try {
      void bridge.notifyReady();
      this.handshakeDone = true;
      return true;
    } catch (error: unknown) {
      this.logBoot('notifyReady failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private logBoot(message: string, data?: Record<string, unknown>): void {
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      console.warn('[testrix boot]', message, data ?? '');
    }
  }

  private async persistRoute(event: NavigationEnd): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge) {
      return;
    }

    try {
      await bridge.config.setSession({
        navigation: {
          lastRoute: event.urlAfterRedirects,
        },
      });
    } catch {
      /* Persisting routing state should never block UX. */
    }
  }
}

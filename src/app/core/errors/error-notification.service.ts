import { Injectable, Signal, signal } from '@angular/core';

import { unwrapIpcInvokeError } from '@shared/errors';

export interface AppBannerError {
  readonly title: string;
  readonly detail: string;
}

/** How long the shell error banner stays visible before auto-dismiss. */
export const ERROR_BANNER_AUTO_DISMISS_MS = 3000;

@Injectable({ providedIn: 'root' })
export class ErrorNotificationService {
  private readonly state = signal<AppBannerError | null>(null);
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

  readonly banner: Signal<AppBannerError | null> = this.state.asReadonly();

  reportUnknown(error: unknown): void {
    const ipc = unwrapIpcInvokeError(error);
    if (ipc) {
      this.show({ title: `Problem (${ipc.code})`, detail: ipc.userMessage });
      return;
    }

    if (error instanceof Error && error.message.trim()) {
      this.reportGeneric(error.message.trim());
      return;
    }

    this.reportGeneric();
  }

  /** Surfaces known UI-safe failures tied to Angular bootstrapped state. */
  reportFromMessage(title: string, detail: string): void {
    this.show({ title, detail });
  }

  reportGeneric(message = 'Something went wrong.'): void {
    this.show({ title: 'Unexpected error', detail: message });
  }

  dismiss(): void {
    this.clearAutoDismiss();
    this.state.set(null);
  }

  private show(error: AppBannerError): void {
    this.state.set(error);
    this.scheduleAutoDismiss();
  }

  private scheduleAutoDismiss(): void {
    this.clearAutoDismiss();
    this.autoDismissTimer = setTimeout(() => {
      this.autoDismissTimer = null;
      this.state.set(null);
    }, ERROR_BANNER_AUTO_DISMISS_MS);
  }

  private clearAutoDismiss(): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }
}

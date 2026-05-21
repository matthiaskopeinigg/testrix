import { Injectable, type Signal, signal } from '@angular/core';

import type {
  TxNotificationPayload,
  TxNotificationTone,
} from '@app/shared/components/tx-notification/tx-notification.types';

const DEFAULT_DURATION_MS = 3_200;

/**
 * Ephemeral toast notifications (success, info, warning, error).
 * Rendered by `tx-notification-host` in the shell layout.
 */
@Injectable({ providedIn: 'root' })
export class TxNotificationService {
  private readonly state = signal<TxNotificationPayload | null>(null);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 0;

  readonly active: Signal<TxNotificationPayload | null> = this.state.asReadonly();

  showSuccess(message: string, durationMs = DEFAULT_DURATION_MS): void {
    this.show({ message, tone: 'success', durationMs });
  }

  showError(message: string, durationMs = DEFAULT_DURATION_MS): void {
    this.show({ message, tone: 'error', durationMs });
  }

  showInfo(message: string, durationMs = DEFAULT_DURATION_MS): void {
    this.show({ message, tone: 'info', durationMs });
  }

  showWarning(message: string, durationMs = DEFAULT_DURATION_MS): void {
    this.show({ message, tone: 'warning', durationMs });
  }

  show(options: {
    readonly message: string;
    readonly tone?: TxNotificationTone;
    readonly durationMs?: number;
  }): void {
    this.cancelDismissTimer();

    const payload: TxNotificationPayload = {
      id: `tx-notification-${++this.nextId}`,
      message: options.message,
      tone: options.tone ?? 'info',
      durationMs: options.durationMs ?? DEFAULT_DURATION_MS,
    };

    this.state.set(payload);

    if (payload.durationMs > 0) {
      this.dismissTimer = setTimeout(() => this.dismiss(payload.id), payload.durationMs);
    }
  }

  dismiss(id?: string): void {
    const current = this.state();
    if (id != null && current?.id !== id) {
      return;
    }

    this.cancelDismissTimer();
    this.state.set(null);
  }

  private cancelDismissTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}

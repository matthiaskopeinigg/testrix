import { Injectable, signal } from '@angular/core';

export interface ConfirmDialogRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

interface ConfirmDialogState {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
}

/**
 * App-wide confirm prompt. Destructive actions must go through this instead of
 * `window.confirm` or silent deletes.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly request = signal<ConfirmDialogState | null>(null);
  private pending: ((ok: boolean) => void) | null = null;

  ask(request: ConfirmDialogRequest): Promise<boolean> {
    this.complete(false);
    this.request.set({
      title: request.title,
      body: request.body,
      confirmLabel: request.confirmLabel?.trim() || 'Delete',
      cancelLabel: request.cancelLabel?.trim() || 'Cancel',
    });
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  complete(ok: boolean): void {
    if (!this.pending && !this.request()) {
      return;
    }
    this.request.set(null);
    const pending = this.pending;
    this.pending = null;
    pending?.(ok);
  }
}

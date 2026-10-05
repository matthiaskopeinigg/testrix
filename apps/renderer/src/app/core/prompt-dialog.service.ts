import { Injectable, signal } from '@angular/core';

export interface PromptDialogRequest {
  readonly title: string;
  readonly body: string;
  readonly inputLabel?: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Enter inserts a newline. Ctrl+Enter or the confirm button submits. */
  readonly multiline?: boolean;
  readonly rows?: number;
}

interface PromptDialogState {
  readonly title: string;
  readonly body: string;
  readonly inputLabel: string;
  readonly placeholder: string;
  readonly initialValue: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly multiline: boolean;
  readonly rows: number;
}

/**
 * App-wide text prompt. Used by Manual flow steps so the user must enter a
 * value before the run continues.
 */
@Injectable({ providedIn: 'root' })
export class PromptDialogService {
  readonly request = signal<PromptDialogState | null>(null);
  private pending: ((value: string | null) => void) | null = null;

  ask(request: PromptDialogRequest): Promise<string | null> {
    this.complete(null);
    this.request.set({
      title: request.title,
      body: request.body,
      inputLabel: request.inputLabel?.trim() || 'Value',
      placeholder: request.placeholder ?? '',
      initialValue: request.initialValue ?? '',
      confirmLabel: request.confirmLabel?.trim() || 'Continue',
      cancelLabel: request.cancelLabel?.trim() || 'Cancel',
      multiline: request.multiline === true,
      rows: request.rows ?? 4,
    });
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  complete(value: string | null): void {
    if (!this.pending && !this.request())
      return;
    this.request.set(null);
    const pending = this.pending;
    this.pending = null;
    pending?.(value);
  }
}

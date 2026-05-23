import { Injectable, Signal, signal } from '@angular/core';

import { unwrapIpcInvokeError } from '@shared/errors';

export interface AppBannerError {
  readonly title: string;
  readonly detail: string;
}

@Injectable({ providedIn: 'root' })

export class ErrorNotificationService {
  private readonly state = signal<AppBannerError | null>(null);

  readonly banner: Signal<AppBannerError | null> = this.state.asReadonly();


  reportUnknown(error: unknown): void {
    const ipc = unwrapIpcInvokeError(error);
    if (ipc) {
      this.state.set({ title: `Problem (${ipc.code})`, detail: ipc.userMessage });
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
    this.state.set({ title, detail });


  }



  reportGeneric(message = 'Something went wrong.'): void {
    this.state.set({ title: 'Unexpected error', detail: message });


  }



  dismiss(): void {
    this.state.set(null);

  }



}

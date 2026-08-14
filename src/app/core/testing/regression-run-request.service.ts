import { Injectable, signal } from '@angular/core';

import type { RegressionStartOptions } from '@shared/testing';

export interface RegressionRunRequest {
  readonly regressionId: string;
  readonly options?: Partial<RegressionStartOptions>;
  readonly openResults?: boolean;
}

/**
 * One-shot run requests from the sidebar (or other callers) consumed by the active workspace tab.
 */
@Injectable({ providedIn: 'root' })
export class RegressionRunRequestService {
  readonly pending = signal<RegressionRunRequest | null>(null);

  /** Queues a regression run for the workspace tab to execute. */
  request(request: RegressionRunRequest): void {
    this.pending.set(request);
  }

  consume(regressionId: string): RegressionRunRequest | null {
    const current = this.pending();
    if (!current || current.regressionId !== regressionId) {
      return null;
    }
    this.pending.set(null);
    return current;
  }
}

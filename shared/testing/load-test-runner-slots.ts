import { TestrixError, ErrorCodes } from '../errors';

import { createIdleLoadTestRunMetrics, type LoadTestRunMetrics } from './load-test-run.schema';

/** Runner surface required by the per-load-test slot map. */
export interface LoadTestRunnerSlot {
  /** Latest metrics for this load test. */
  snapshot(): LoadTestRunMetrics;
  /** Cancels an active run and returns the final snapshot. */
  cancel(): LoadTestRunMetrics;
}

/**
 * Returns a trimmed load-test id for IPC, or `null` when missing/blank.
 */
export function parseLoadTestIpcId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const id = value.trim();
  return id.length > 0 ? id : null;
}

/**
 * Stores one runner per load-test artifact so tabs keep isolated metrics.
 */
export class LoadTestRunnerSlots<T extends LoadTestRunnerSlot> {
  private readonly runners = new Map<string, T>();

  /** Returns the runner for `loadTestId`, if any. */
  get(loadTestId: string): T | undefined {
    const id = parseLoadTestIpcId(loadTestId);
    if (!id) {
      return undefined;
    }
    return this.runners.get(id);
  }

  /** Returns live metrics for `loadTestId`, or idle metrics when unknown. */
  snapshot(loadTestId: string): LoadTestRunMetrics {
    return this.get(loadTestId)?.snapshot() ?? createIdleLoadTestRunMetrics();
  }

  /** Returns whether `loadTestId` currently has an active run. */
  status(loadTestId: string): { readonly running: boolean } {
    return { running: this.snapshot(loadTestId).running };
  }

  /**
   * Throws when this load test is already running. Call before replacing the slot.
   */
  assertCanStart(loadTestId: string): void {
    if (this.snapshot(loadTestId).running) {
      throw new TestrixError(ErrorCodes.LOAD_TEST_ALREADY_RUNNING, 'A load test is already running.');
    }
  }

  /** Stores `runner` as the slot for `loadTestId`. */
  set(loadTestId: string, runner: T): void {
    const id = parseLoadTestIpcId(loadTestId);
    if (!id) {
      return;
    }
    this.runners.set(id, runner);
  }

  /** Cancels the runner for `loadTestId`, or returns idle metrics when none exists. */
  cancel(loadTestId: string): LoadTestRunMetrics {
    const runner = this.get(loadTestId);
    if (!runner) {
      return createIdleLoadTestRunMetrics();
    }
    return runner.cancel();
  }
}

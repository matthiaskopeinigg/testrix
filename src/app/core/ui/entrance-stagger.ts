import type { DestroyRef, WritableSignal } from '@angular/core';

/**
 * Re-triggers a stagger container: resets play, then enables after two animation frames.
 */
export function replayEntranceStagger(play: WritableSignal<boolean>, staggerEnabled: () => boolean): void {
  if (!staggerEnabled()) {
    play.set(true);
    return;
  }

  play.set(false);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => play.set(true));
  });
}

export interface EntranceStaggerStartOptions {
  readonly enabled: () => boolean;
  readonly destroyRef: DestroyRef;
  /** Direct children count for settle timing (capped at 24 to match CSS). */
  readonly childCount?: () => number;
}

/**
 * Plays an entrance stagger once, then locks children visible via `--settled`.
 */
export function startEntranceStaggerAnimation(
  play: WritableSignal<boolean>,
  settled: WritableSignal<boolean>,
  options: EntranceStaggerStartOptions,
): void {
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const lockEntrance = (): void => {
    // Keep --play true: settled visibility CSS requires both modifiers.
    play.set(true);
    settled.set(true);
  };

  const cancelSettleTimer = (): void => {
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };

  const scheduleSettle = (): void => {
    cancelSettleTimer();

    if (!options.enabled()) {
      lockEntrance();
      return;
    }

    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const stepMs = styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-step')) || 42 : 42;
    const durationMs =
      (styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-duration')) || 0.3 : 0.3) *
      1000;
    const count = Math.min(Math.max(1, options.childCount?.() ?? 12), 24);
    const settleMs = stepMs * (count - 1) + durationMs;

    settleTimer = setTimeout(() => {
      settleTimer = null;
      lockEntrance();
    }, settleMs);
  };

  options.destroyRef.onDestroy(cancelSettleTimer);

  if (!options.enabled()) {
    lockEntrance();
    return;
  }

  settled.set(false);
  replayEntranceStagger(play, options.enabled);
  scheduleSettle();
}

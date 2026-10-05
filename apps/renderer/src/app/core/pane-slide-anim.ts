import type { AnimationCallbackEvent } from '@angular/core';

export type PaneSlideDir = 'left' | 'right' | null;

/** Reads the live motion scale from design tokens (0 = animations off). */
export function readMotionScale(): number {
  if (typeof document === 'undefined')
    return 1.25;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tx-motion-scale').trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 1.25;
}

function readLeaveScale(): number {
  if (typeof document === 'undefined')
    return readMotionScale();
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tx-motion-leave-scale').trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : readMotionScale();
}

function durationMs(base: number, scale = readMotionScale()): number {
  if (!Number.isFinite(scale) || scale <= 0)
    return 0;
  return Math.max(0, Math.round(base * scale));
}

function finish(event: AnimationCallbackEvent): void {
  try {
    event.animationComplete();
  } catch {
    /* already completed */
  }
}

/**
 * Enter slide for section / docs panes via Web Animations API.
 * Avoids emulated-encapsulation keyframe rename issues with CSS animate.enter classes.
 */
export function runPaneEnter(
  event: AnimationCallbackEvent,
  dir: PaneSlideDir,
  options?: {
    readonly distance?: number;
    readonly duration?: number;
    /** Keep the pane absolutely filled (tab stages) so layout does not jump. */
    readonly pinned?: boolean;
    readonly scale?: boolean;
  },
): void {
  const el = event.target;
  const ms = durationMs(options?.duration ?? 420);
  if (!(el instanceof HTMLElement) || !dir || ms <= 0) {
    finish(event);
    return;
  }

  try {
    if (options?.pinned) {
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = 'auto';
      el.style.height = 'auto';
    } else {
      el.style.position = '';
      el.style.inset = '';
    }
    el.style.zIndex = '1';
    el.style.pointerEvents = '';

    const distance = options?.distance ?? 18;
    const fromX = dir === 'right' ? distance : -distance;
    const useScale = options?.scale !== false && !options?.pinned;
    const anim = el.animate(
      [
        {
          opacity: 0,
          transform: useScale
            ? `translateX(${fromX}px) scale(0.985)`
            : `translateX(${fromX}px)`,
        },
        {
          opacity: 1,
          transform: useScale ? 'translateX(0) scale(1)' : 'translateX(0)',
        },
      ],
      {
        duration: ms,
        easing: 'cubic-bezier(0.22, 1.15, 0.36, 1)',
        fill: 'both',
      },
    );
    void anim.finished.then(
      () => {
        el.style.zIndex = '';
        finish(event);
      },
      () => {
        el.style.zIndex = '';
        finish(event);
      },
    );
  } catch {
    finish(event);
  }
}

/**
 * Leave slide for section / docs panes. Pins the outgoing pane absolutely so the
 * incoming pane keeps a stable in-flow size (matches Request / folder editors).
 */
export function runPaneLeave(
  event: AnimationCallbackEvent,
  dir: PaneSlideDir,
  options?: {
    readonly distance?: number;
    readonly duration?: number;
    readonly pinned?: boolean;
    readonly scale?: boolean;
  },
): void {
  const el = event.target;
  const ms = durationMs(options?.duration ?? 280, readLeaveScale());
  if (!(el instanceof HTMLElement) || ms <= 0) {
    finish(event);
    return;
  }

  try {
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.zIndex = '2';
    el.style.pointerEvents = 'none';
    el.style.width = 'auto';
    el.style.height = 'auto';

    const distance = options?.distance ?? 14;
    const toX = !dir ? 0 : dir === 'left' ? distance : -distance;
    const useScale = options?.scale !== false && !options?.pinned;
    const anim = el.animate(
      [
        {
          opacity: 1,
          transform: useScale ? 'translateX(0) scale(1)' : 'translateX(0)',
        },
        {
          opacity: 0,
          transform: useScale
            ? `translateX(${toX}px) scale(0.985)`
            : `translateX(${toX}px)`,
        },
      ],
      {
        duration: ms,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      },
    );
    void anim.finished.then(() => finish(event), () => finish(event));
  } catch {
    finish(event);
  }
}

import {
  DestroyRef,
  afterNextRender,
  effect,
  signal,
  untracked,
} from '@angular/core';

import type { UiPreferencesService } from './ui-preferences.service';

import { replayEntranceStagger, startEntranceStaggerAnimation } from './entrance-stagger';

/** Stagger timing derived from `html[data-animation-speed]` tokens. */
export function readEntranceStaggerSettleMs(childCount = 12, extraMs = 40): number {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const styles = root ? getComputedStyle(root) : null;
  const stepMs = styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-step')) || 42 : 42;
  const durationMs =
    (styles ? Number.parseFloat(styles.getPropertyValue('--tx-entrance-stagger-duration')) || 0.3 : 0.3) * 1000;
  const count = Math.min(Math.max(1, childCount), 24);
  return stepMs * (count - 1) + durationMs + extraMs;
}

/**
 * Motion for collection request / folder workspace tabs (load stagger + section switch).
 */
export class WorkspaceTabMotionController {
  readonly loadStaggerPlay = signal(false);
  readonly loadStaggerSettled = signal(false);

  readonly sectionStaggerPlay = signal<string | null>(null);
  readonly sectionStaggerArming = signal(false);

  readonly paneSwitchActive = signal(false);

  private loadInitialized = false;
  private sectionStaggerTimer: ReturnType<typeof setTimeout> | null = null;
  private paneSwitchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly uiPreferences: UiPreferencesService,
    private readonly destroyRef: DestroyRef,
  ) {
    this.destroyRef.onDestroy(() => {
      this.cancelSectionStaggerTimer();
      this.cancelPaneSwitchTimer();
    });
  }

  /** Locks chrome visible without playing stagger (cached tab host). */
  settleLoadImmediately(): void {
    this.loadInitialized = true;
    this.loadStaggerPlay.set(false);
    this.loadStaggerSettled.set(true);
  }

  /** Initial chrome stagger after the tab view mounts (skipped when {@link skipInitialLoad} is true). */
  startLoadAfterRender(loadChildCount: () => number, skipInitialLoad?: () => boolean): void {
    afterNextRender(() => {
      if (skipInitialLoad?.()) {
        this.settleLoadImmediately();
        return;
      }
      startEntranceStaggerAnimation(this.loadStaggerPlay, this.loadStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: loadChildCount,
      });
    });
  }

  /**
   * Replays chrome stagger when the tab resource or session revision changes.
   * Replay is skipped while {@link tabActive} is false.
   */
  bindLoadReplay(
    loadKey: () => string,
    loadChildCount: () => number,
    options?: { readonly tabActive?: () => boolean },
  ): void {
    effect(() => {
      const key = loadKey();
      const active = options?.tabActive?.() ?? true;
      if (!this.loadInitialized) {
        this.loadInitialized = true;
        return;
      }
      if (!active) {
        return;
      }
      untracked(() => this.replayLoadStagger(loadChildCount()));
    });
  }

  /** Pane crossfade + content stagger when the active section changes. */
  onSectionChange(sectionId: string, contentBlockCount = 6): void {
    this.scheduleSectionContentStagger(sectionId, contentBlockCount);
    this.triggerPaneSwitch();
  }

  isSectionContentAnimating(sectionId: string): boolean {
    return this.sectionStaggerPlay() === sectionId;
  }

  isSectionContentSettled(sectionId: string, isActive: boolean): boolean {
    const play = this.sectionStaggerPlay();
    if (play === sectionId) {
      return false;
    }
    if (this.sectionStaggerArming() && isActive) {
      return false;
    }
    if (isActive && play !== null && play !== sectionId) {
      return false;
    }
    return true;
  }

  private replayLoadStagger(childCount: number): void {
    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.loadStaggerPlay.set(true);
      this.loadStaggerSettled.set(true);
      return;
    }

    this.loadStaggerSettled.set(false);
    replayEntranceStagger(this.loadStaggerPlay, () => this.uiPreferences.entranceStaggerEnabled());

    const settleMs = readEntranceStaggerSettleMs(childCount);
    setTimeout(() => {
      this.loadStaggerPlay.set(false);
      this.loadStaggerSettled.set(true);
    }, settleMs);
  }

  private scheduleSectionContentStagger(sectionId: string, blockCount: number): void {
    this.cancelSectionStaggerTimer();

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.sectionStaggerPlay.set(null);
      this.sectionStaggerArming.set(false);
      return;
    }

    this.sectionStaggerArming.set(true);
    this.sectionStaggerPlay.set(null);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.sectionStaggerArming.set(false);
        this.sectionStaggerPlay.set(sectionId);
        this.scheduleSectionStaggerEnd(sectionId, blockCount);
      });
    });
  }

  private scheduleSectionStaggerEnd(sectionId: string, blockCount: number): void {
    this.cancelSectionStaggerTimer();
    const settleMs = readEntranceStaggerSettleMs(blockCount);

    this.sectionStaggerTimer = setTimeout(() => {
      this.sectionStaggerTimer = null;
      if (this.sectionStaggerPlay() === sectionId) {
        this.sectionStaggerPlay.set(null);
      }
    }, settleMs);
  }

  private triggerPaneSwitch(): void {
    this.cancelPaneSwitchTimer();

    if (!this.uiPreferences.animationsEnabled()) {
      this.paneSwitchActive.set(false);
      return;
    }

    this.paneSwitchActive.set(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.paneSwitchActive.set(true);
        const root = typeof document !== 'undefined' ? document.documentElement : null;
        const styles = root ? getComputedStyle(root) : null;
        const motionScale =
          styles ? Number.parseFloat(styles.getPropertyValue('--tx-motion-scale')) || 1 : 1;
        const durationMs = Math.round(180 * motionScale) + 24;

        this.paneSwitchTimer = setTimeout(() => {
          this.paneSwitchTimer = null;
          this.paneSwitchActive.set(false);
        }, durationMs);
      });
    });
  }

  private cancelSectionStaggerTimer(): void {
    if (this.sectionStaggerTimer !== null) {
      clearTimeout(this.sectionStaggerTimer);
      this.sectionStaggerTimer = null;
    }
  }

  private cancelPaneSwitchTimer(): void {
    if (this.paneSwitchTimer !== null) {
      clearTimeout(this.paneSwitchTimer);
      this.paneSwitchTimer = null;
    }
  }
}

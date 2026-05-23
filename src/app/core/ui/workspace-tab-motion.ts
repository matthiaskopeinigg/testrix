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

export interface WorkspaceTabSectionChangeOptions {
  /** Direct `.tx-entrance-stagger__block` children in the section shell (for settle timing). */
  readonly contentBlockCount?: number;
}

/**
 * Motion for collection request / folder / websocket workspace tabs:
 * chrome stagger on load, section content stagger on each section switch.
 */
export class WorkspaceTabMotionController {
  readonly loadStaggerPlay = signal(false);
  readonly loadStaggerSettled = signal(false);

  private readonly sectionContentStaggerId = signal<string | null>(null);
  private sectionStaggerTimer: ReturnType<typeof setTimeout> | null = null;
  private loadInitialized = false;

  constructor(
    private readonly uiPreferences: UiPreferencesService,
    private readonly destroyRef: DestroyRef,
  ) {
    this.destroyRef.onDestroy(() => this.cancelSectionStaggerTimer());
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

  /**
   * Staggers direct children of the active section shell when the user switches sections.
   */
  onSectionChange(sectionId: string, options?: WorkspaceTabSectionChangeOptions): void {
    this.cancelSectionStaggerTimer();

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.sectionContentStaggerId.set(null);
      return;
    }

    this.sectionContentStaggerId.set(sectionId);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.sectionContentStaggerId() !== sectionId) {
          return;
        }

        const settleMs = readEntranceStaggerSettleMs(options?.contentBlockCount ?? 4);
        this.sectionStaggerTimer = setTimeout(() => {
          this.sectionStaggerTimer = null;
          if (this.sectionContentStaggerId() === sectionId) {
            this.sectionContentStaggerId.set(null);
          }
        }, settleMs);
      });
    });
  }

  /** True while the section shell should apply `tx-entrance-stagger--play`. */
  isSectionContentAnimating(sectionId: string): boolean {
    return this.sectionContentStaggerId() === sectionId;
  }

  /** True when the section shell should lock children visible (`tx-entrance-stagger--settled`). */
  isSectionContentSettled(sectionId: string): boolean {
    return this.sectionContentStaggerId() !== sectionId;
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

  private cancelSectionStaggerTimer(): void {
    if (this.sectionStaggerTimer !== null) {
      clearTimeout(this.sectionStaggerTimer);
      this.sectionStaggerTimer = null;
    }
  }
}

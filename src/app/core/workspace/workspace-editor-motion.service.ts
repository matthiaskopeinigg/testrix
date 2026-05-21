import { Injectable, inject, signal } from '@angular/core';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

const LAYOUT_MOTION_MS = 150;

/**
 * Drives short-lived CSS animation classes for workspace split layout.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceEditorMotionService {
  private readonly uiPrefs = inject(UiPreferencesService);

  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  /** `split` while a pane is appearing; `merge` while panes consolidate. */
  readonly layoutTransition = signal<'split' | 'merge' | null>(null);

  /** Pane group ids that should play the pane enter animation. */
  readonly enteringPaneGroupIds = signal<ReadonlySet<string>>(new Set());

  /** Whether motion utilities should run (respects settings + reduced motion). */
  isEnabled(): boolean {
    return this.uiPrefs.animationsEnabled();
  }

  /**
   * Runs a layout mutation immediately and animates new panes in (split / drag-split).
   */
  runSplitTransition(newPaneGroupIds: readonly string[], mutate: () => void): void {
    if (!this.isEnabled()) {
      mutate();
      return;
    }

    this.layoutTransition.set('split');
    this.enteringPaneGroupIds.set(new Set(newPaneGroupIds));
    mutate();

    this.schedule(() => {
      this.layoutTransition.set(null);
      this.enteringPaneGroupIds.set(new Set());
    }, LAYOUT_MOTION_MS);
  }

  /**
   * Plays merge animation, then runs the layout mutation (single pane).
   */
  runMergeTransition(mutate: () => void): void {
    if (!this.isEnabled()) {
      mutate();
      return;
    }

    this.layoutTransition.set('merge');
    this.schedule(() => {
      mutate();
      this.layoutTransition.set(null);
      this.enteringPaneGroupIds.set(new Set());
    }, LAYOUT_MOTION_MS);
  }

  isPaneEntering(groupId: string): boolean {
    return this.enteringPaneGroupIds().has(groupId);
  }

  private schedule(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }
}

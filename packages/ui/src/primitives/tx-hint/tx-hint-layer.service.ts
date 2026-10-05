import { Injectable, signal } from '@angular/core';

import { estimateHintSize, placeHint, type TxHintPlacement } from './tx-hint-position';

export interface TxHintLayerState {
  readonly id: string;
  readonly text: string;
  readonly keys: readonly string[];
  readonly placement: TxHintPlacement;
  readonly x: number;
  readonly y: number;
}

const FLASH_ID = 'tx-hint-flash';
const FLASH_MS = 1400;

/**
 * One viewport-fixed tooltip at a time. Hints inside transformed surfaces (the
 * workbench canvas) must render here, not next to their trigger.
 */
@Injectable({ providedIn: 'root' })
export class TxHintLayerService {
  readonly active = signal<TxHintLayerState | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  show(state: TxHintLayerState): void {
    if (state.id !== FLASH_ID)
      this.clearFlashTimer();
    this.active.set(state);
  }

  showFor(id: string, text: string, target: HTMLElement, placement: TxHintPlacement = 'top'): void {
    const size = estimateHintSize(text, 0);
    const point = placeHint(placement, target.getBoundingClientRect(), size.width, size.height);
    this.show({
      id,
      text,
      keys: [],
      placement,
      x: point.x,
      y: point.y,
    });
  }

  hide(id: string): void {
    if (this.active()?.id === id)
      this.active.set(null);
  }

  /** Dismiss whatever hint is visible (e.g. when opening a panel). */
  clear(): void {
    this.clearFlashTimer();
    this.active.set(null);
  }

  /**
   * Show a short confirmation bubble at a control. Survives the pointerdown
   * that closes hover hints on the same target.
   */
  flashAt(text: string, target: HTMLElement, placement: TxHintPlacement = 'top'): void {
    const size = estimateHintSize(text, 0);
    const point = placeHint(placement, target.getBoundingClientRect(), size.width, size.height);
    this.show({
      id: FLASH_ID,
      text,
      keys: [],
      placement,
      x: point.x,
      y: point.y,
    });
    this.clearFlashTimer();
    this.flashTimer = setTimeout(() => this.hide(FLASH_ID), FLASH_MS);
  }

  private clearFlashTimer(): void {
    if (!this.flashTimer)
      return;
    clearTimeout(this.flashTimer);
    this.flashTimer = null;
  }
}

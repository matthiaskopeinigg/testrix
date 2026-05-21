import { Injectable } from '@angular/core';

import type { TxTooltipPosition } from './tx-tooltip.types';

const SHOW_DELAY_MS = 320;
const OFFSET_PX = 8;

/**
 * Renders a single global tooltip element (avoids clipping in overflow containers).
 */
@Injectable({ providedIn: 'root' })
export class TxTooltipService {
  private element: HTMLDivElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private anchor: HTMLElement | null = null;

  show(anchor: HTMLElement, text: string, position: TxTooltipPosition): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    this.clearShowTimer();
    this.anchor = anchor;

    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.anchor !== anchor) {
        return;
      }

      const tip = this.ensureElement();
      tip.textContent = trimmed;
      tip.dataset['position'] = position;
      if (trimmed.includes('\n') || trimmed.length > 52) {
        tip.dataset['multiline'] = 'true';
      } else {
        delete tip.dataset['multiline'];
      }
      tip.classList.remove('is-visible');
      tip.style.visibility = 'hidden';
      this.position(anchor, position, tip);
      tip.style.visibility = '';
      tip.classList.add('is-visible');
    }, SHOW_DELAY_MS);
  }

  hide(anchor?: HTMLElement): void {
    this.clearShowTimer();

    if (anchor && this.anchor !== anchor) {
      return;
    }

    this.anchor = null;
    this.element?.classList.remove('is-visible');
  }

  hideImmediate(): void {
    this.clearShowTimer();
    this.anchor = null;
    this.element?.classList.remove('is-visible');
  }

  private ensureElement(): HTMLDivElement {
    if (this.element) {
      return this.element;
    }

    const tip = document.createElement('div');
    tip.className = 'tx-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    this.element = tip;
    return tip;
  }

  private position(anchor: HTMLElement, position: TxTooltipPosition, tip: HTMLDivElement): void {
    const rect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const viewportPad = 6;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = rect.top - tipRect.height - OFFSET_PX;
        left = rect.left + (rect.width - tipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + OFFSET_PX;
        left = rect.left + (rect.width - tipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tipRect.height) / 2;
        left = rect.left - tipRect.width - OFFSET_PX;
        break;
      case 'right':
      default:
        top = rect.top + (rect.height - tipRect.height) / 2;
        left = rect.right + OFFSET_PX;
        break;
    }

    left = Math.min(Math.max(viewportPad, left), window.innerWidth - tipRect.width - viewportPad);
    top = Math.min(Math.max(viewportPad, top), window.innerHeight - tipRect.height - viewportPad);

    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  }

  private clearShowTimer(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }
}

import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

import { TxHintLayerService } from './tx-hint-layer.service';
import { estimateHintSize, placeHint, type TxHintPlacement } from './tx-hint-position';

export type TxHintVariant = 'tooltip' | 'inline';
export type { TxHintPlacement };

let hintUid = 0;

/**
 * Custom hint surface for tooltips and keyboard shortcuts.
 * Never use native `title` or bare `<kbd>` — always use this component.
 */
@Component({
  selector: 'tx-hint',
  standalone: true,
  templateUrl: './tx-hint.component.html',
  styleUrl: './tx-hint.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-hint',
    '[class.tx-hint--inline]': 'variant() === "inline"',
    '[class.tx-hint--tooltip]': 'variant() === "tooltip"',
    '[class.tx-hint--stretch]': 'stretch()',
  },
})
export class TxHintComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly layer = inject(TxHintLayerService);

  readonly variant = input<TxHintVariant>('tooltip');
  /** Primary hint copy shown in the tooltip bubble or beside inline keys. */
  readonly label = input<string>('');
  /** Optional secondary line inside the tooltip. */
  readonly detail = input<string | null>(null);
  /** Shortcut string such as `Ctrl K` or `Ctrl+,`. */
  readonly keys = input<string | readonly string[] | null>(null);
  readonly placement = input<TxHintPlacement>('right');
  readonly delayMs = input(200);
  /** Unwrap the host box so wrapping a list row does not change flex/grid layout. */
  readonly stretch = input(false, { transform: booleanAttribute });
  /** Hide the tooltip while a menu or overlay from this control is open. */
  readonly suppressed = input(false, { transform: booleanAttribute });

  readonly tooltipId = `tx-hint-${++hintUid}`;
  readonly isOpen = signal(false);

  readonly keyParts = computed(() => {
    const value = this.keys();
    if (!value) {
      return [] as string[];
    }
    if (typeof value !== 'string') {
      return [...value];
    }
    return value
      .split(/\s*\+\s*|\s+/)
      .map((part: string) => part.trim())
      .filter(Boolean);
  });

  readonly bubbleText = computed(() => {
    const label = this.label().trim();
    const detail = this.detail()?.trim();
    if (label && detail) {
      return `${label} — ${detail}`;
    }
    return label || detail || '';
  });

  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private pointerLocked = false;

  constructor() {
    effect(() => {
      if (this.suppressed()) {
        this.handleClose();
      }
    });
    inject(DestroyRef).onDestroy(() => this.handleClose());
  }

  handleOpen(immediate = false): void {
    if (this.variant() !== 'tooltip' || this.pointerLocked || this.suppressed()) {
      return;
    }
    this.clearTimer();
    if (immediate) {
      this.showBubble();
      return;
    }
    this.openTimer = setTimeout(() => this.showBubble(), this.delayMs());
  }

  handleFocusOpen(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) {
      return;
    }
    this.handleOpen(true);
  }

  handlePointerDown(): void {
    this.pointerLocked = true;
    this.handleClose();
  }

  handlePointerLeave(): void {
    this.pointerLocked = false;
    this.handleClose();
  }

  handleTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.handleClose();
    }
  }

  handleClose(): void {
    this.clearTimer();
    this.isOpen.set(false);
    this.layer.hide(this.tooltipId);
  }

  private showBubble(): void {
    const trigger = this.host.nativeElement.querySelector('.tx-hint__trigger');
    if (!(trigger instanceof HTMLElement)) {
      return;
    }
    const size = estimateHintSize(this.bubbleText(), this.keyParts().length);
    const point = placeHint(this.placement(), hintAnchorRect(trigger), size.width, size.height);
    this.isOpen.set(true);
    this.layer.show({
      id: this.tooltipId,
      text: this.bubbleText(),
      keys: this.keyParts(),
      placement: this.placement(),
      x: point.x,
      y: point.y,
    });
  }

  private clearTimer(): void {
    if (!this.openTimer) {
      return;
    }
    clearTimeout(this.openTimer);
    this.openTimer = null;
  }
}

function hintAnchorRect(trigger: HTMLElement): DOMRect {
  const control = trigger.querySelector('button, a, input, [tabindex]');
  const child = control ?? trigger.firstElementChild;
  const el = child instanceof HTMLElement ? child : trigger;
  const rect = el.getBoundingClientRect();
  const clip = nearestClipRect(el);
  if (!clip) {
    return rect;
  }
  const left = Math.max(rect.left, clip.left);
  const top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.right, clip.right);
  const bottom = Math.min(rect.bottom, clip.bottom);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function nearestClipRect(el: HTMLElement): DOMRect | null {
  let current = el.parentElement;
  while (current && current !== document.body) {
    const style = getComputedStyle(current);
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      return current.getBoundingClientRect();
    }
    current = current.parentElement;
  }
  return null;
}


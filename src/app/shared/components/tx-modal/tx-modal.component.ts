import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterRenderEffect,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** Fallback when `--tx-duration-base` is unavailable. */
const MODAL_CLOSE_MS_FALLBACK = 180;

@Component({
  selector: 'tx-modal',
  standalone: true,
  imports: [],
  templateUrl: './tx-modal.component.html',
  styleUrl: './tx-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxModalComponent {
  readonly open = input(false);
  readonly title = input('Dialog');
  readonly ariaLabel = input('Dialog');
  readonly dismissOnBackdrop = input(true);

  /** Use `stacked` when opening above the settings overlay (z-index 1100). */
  readonly layer = input<'default' | 'stacked'>('default');

  /** `wide` uses a fixed large card width for code / data-heavy dialogs. */
  readonly cardSize = input<'default' | 'wide'>('default');

  readonly closed = output<void>();

  protected readonly isVisible = signal(false);
  protected readonly isShown = signal(false);

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');

  private portaledRoot: HTMLElement | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private isClosing = false;

  constructor() {
    afterRenderEffect(() => {
      if (!this.isVisible()) {
        return;
      }

      this.portalRootToBody();
    });

    effect(() => {
      if (this.open()) {
        this.beginOpen();
        return;
      }

      if (this.isVisible()) {
        this.beginClose();
      }
    });

    effect(() => {
      if (this.isVisible()) {
        return;
      }

      this.removePortaledRoot();
    });

    this.destroyRef.onDestroy(() => {
      this.cancelCloseTimer();
      this.removePortaledRoot();
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (!this.open() || this.isClosing) {
      return;
    }

    this.close();
  }

  protected onBackdrop(): void {
    if (!this.dismissOnBackdrop() || this.isClosing) {
      return;
    }

    this.close();
  }

  protected close(): void {
    if (!this.open() && !this.isVisible()) {
      return;
    }

    this.closed.emit();
  }

  /** Escapes overflow-hidden ancestors (e.g. sidebar panels). */
  private portalRootToBody(): void {
    const root = this.rootRef()?.nativeElement;
    if (!root || root.parentElement === this.document.body) {
      if (root) {
        this.portaledRoot = root;
      }
      return;
    }

    this.document.body.appendChild(root);
    this.portaledRoot = root;
  }

  private beginOpen(): void {
    this.cancelCloseTimer();
    this.isClosing = false;
    this.isVisible.set(true);

    if (!this.motionEnabled()) {
      this.isShown.set(true);
      return;
    }

    this.isShown.set(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.open()) {
          this.isShown.set(true);
        }
      });
    });
  }

  private beginClose(): void {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.isShown.set(false);
    this.cancelCloseTimer();

    const duration = this.motionEnabled() ? this.cardTransitionMs() : 0;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.isVisible.set(false);
      this.isClosing = false;
    }, duration);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private removePortaledRoot(): void {
    const root = this.portaledRoot;
    if (root?.isConnected) {
      root.remove();
    }
    this.portaledRoot = null;
  }

  private motionEnabled(): boolean {
    const root = this.document.documentElement;
    return root.getAttribute('data-animation-speed') !== 'none';
  }

  /** Keeps the unmount timer aligned with `--tx-duration-base` on `:root`. */
  private cardTransitionMs(): number {
    const raw = getComputedStyle(this.document.documentElement).getPropertyValue('--tx-duration-base').trim();
    return parseCssDurationMs(raw) ?? MODAL_CLOSE_MS_FALLBACK;
  }
}

function parseCssDurationMs(value: string): number | null {
  if (!value) {
    return null;
  }

  if (value.endsWith('ms')) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value.endsWith('s')) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed * 1000 : null;
  }

  return null;
}

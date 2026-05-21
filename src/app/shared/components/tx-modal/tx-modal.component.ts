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
  viewChild,
} from '@angular/core';

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

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');

  private portaledRoot: HTMLElement | null = null;

  constructor() {
    afterRenderEffect(() => {
      if (!this.open()) {
        return;
      }

      this.portalRootToBody();
    });

    effect(() => {
      if (this.open()) {
        return;
      }

      this.removePortaledRoot();
    });

    this.destroyRef.onDestroy(() => {
      this.removePortaledRoot();
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (!this.open()) {
      return;
    }

    this.close();
  }

  protected onBackdrop(): void {
    if (!this.dismissOnBackdrop()) {
      return;
    }

    this.close();
  }

  protected close(): void {
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

  private removePortaledRoot(): void {
    const root = this.portaledRoot;
    if (root?.isConnected) {
      root.remove();
    }
    this.portaledRoot = null;
  }
}

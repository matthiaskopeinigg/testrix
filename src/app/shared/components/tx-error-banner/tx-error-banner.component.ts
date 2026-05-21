import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

@Component({
  selector: 'tx-error-banner',
  standalone: true,
  imports: [],
  templateUrl: './tx-error-banner.component.html',
  styleUrl: './tx-error-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxErrorBannerComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');

  private portaledRoot: HTMLElement | null = null;

  protected readonly active = this.notifier.banner;

  constructor() {
    afterRenderEffect(() => {
      if (!this.active()) {
        return;
      }

      this.portalToBody();
    });

    effect(() => {
      if (this.active()) {
        return;
      }

      this.removePortaledRoot();
    });

    this.destroyRef.onDestroy(() => {
      this.removePortaledRoot();
    });
  }

  protected handleDismiss(): void {
    this.notifier.dismiss();
  }

  /** Escapes overflow-hidden ancestors; no scrim — card only. */
  private portalToBody(): void {
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

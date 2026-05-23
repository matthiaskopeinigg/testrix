import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

const MIN_SECONDARY_HEIGHT = 140;
const AUTO_HIDE_THRESHOLD = 120;
const SECONDARY_MOTION_MS_FALLBACK = 180;

@Component({
  selector: 'tx-vertical-split-pane',
  standalone: true,
  imports: [TxIconComponent],
  template: `
    <div class="tx-vertical-split-pane">
      <div class="tx-vertical-split-pane__primary">
        <ng-content select="[txSplitPrimary]" />
      </div>
      @if (secondaryVisible()) {
        @if (showReveal()) {
          <div
            class="tx-vertical-split-pane__reveal"
            [class.tx-vertical-split-pane__reveal--enter]="revealEntering()"
          >
            <button
              type="button"
              class="tx-vertical-split-pane__reveal-pill"
              [title]="'Show ' + revealLabel() + ' panel'"
              [attr.aria-label]="'Show ' + revealLabel() + ' panel'"
              (click)="handleRevealClick($event)"
            >
              <tx-icon name="chevronUp" [size]="12" aria-hidden="true" />
              <span>{{ revealLabel() }}</span>
            </button>
          </div>
        }
        @if (showPanel()) {
          <div
            class="tx-vertical-split-pane__panel-region"
            [class.tx-vertical-split-pane__panel-region--motion]="panelMotionActive()"
            [class.tx-vertical-split-pane__panel-region--expanded]="panelExpanded()"
            [style.height.px]="panelRegionHeight()"
          >
            <div
              class="tx-vertical-split-pane__handle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize panels"
              (mousedown)="handlePointerDown($event)"
            >
              <button
                type="button"
                class="tx-vertical-split-pane__hide-pill"
                [title]="'Hide ' + revealLabel() + ' panel'"
                [attr.aria-label]="'Hide ' + revealLabel() + ' panel'"
                (click)="handleHideClick($event)"
              >
                <tx-icon name="chevronDown" [size]="12" aria-hidden="true" />
                <span>Hide</span>
              </button>
            </div>
            <div
              class="tx-vertical-split-pane__secondary"
              [style.height.px]="secondaryHeight()"
              [style.flex-basis.px]="secondaryHeight()"
              [style.min-height.px]="secondaryHeight()"
              [style.max-height.px]="secondaryHeight()"
            >
              <div
                class="tx-vertical-split-pane__secondary-content"
                [class.tx-vertical-split-pane__secondary-content--visible]="panelExpanded()"
              >
                <ng-content select="[txSplitSecondary]" />
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styleUrl: './tx-vertical-split-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxVerticalSplitPaneComponent {
  readonly secondaryHeight = input(280);
  readonly secondaryVisible = input(true);
  readonly secondaryHidden = input(false);
  /** Label on the reveal/hide pills (default: Response). */
  readonly revealLabel = input('Response');
  readonly secondaryHeightChange = output<number>();
  readonly secondaryHeightCommit = output<number>();
  readonly secondaryHiddenChange = output<boolean>();

  protected readonly showReveal = signal(false);
  protected readonly showPanel = signal(false);
  protected readonly panelExpanded = signal(false);
  protected readonly panelMotionActive = signal(false);
  protected readonly revealEntering = signal(false);

  protected readonly panelRegionHeight = computed(() => {
    if (!this.showPanel() || !this.panelExpanded()) {
      return 0;
    }
    return this.handleHeightPx + this.secondaryHeight();
  });

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly handleHeightPx = 14;
  private motionTimer: ReturnType<typeof setTimeout> | null = null;
  private dragging = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelMotionTimer());

    effect(() => {
      const visible = this.secondaryVisible();
      const hidden = this.secondaryHidden();

      untracked(() => {
        if (!visible) {
          this.resetSecondaryRegion();
          return;
        }

        if (hidden) {
          this.collapsePanel();
        } else {
          this.expandPanel();
        }
      });
    });
  }

  protected handleHideClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.secondaryHiddenChange.emit(true);
  }

  protected handleRevealClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.secondaryHiddenChange.emit(false);
  }

  protected handlePointerDown(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.tx-vertical-split-pane__hide-pill')) {
      return;
    }
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = this.secondaryHeight();
    let lastHeight = startHeight;
    this.dragging = true;
    this.panelMotionActive.set(false);

    const onMove = (e: MouseEvent): void => {
      const delta = startY - e.clientY;
      const next = Math.min(600, Math.max(MIN_SECONDARY_HEIGHT, startHeight + delta));
      lastHeight = next;
      if (next <= AUTO_HIDE_THRESHOLD) {
        this.secondaryHiddenChange.emit(true);
        cleanup();
        return;
      }
      this.secondaryHeightChange.emit(next);
    };

    const onUp = (): void => {
      if (lastHeight <= AUTO_HIDE_THRESHOLD) {
        this.secondaryHiddenChange.emit(true);
      } else {
        this.secondaryHeightCommit.emit(lastHeight);
      }
      cleanup();
    };

    const cleanup = (): void => {
      this.dragging = false;
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  private expandPanel(): void {
    this.cancelMotionTimer();
    this.revealEntering.set(false);

    if (!this.motionEnabled()) {
      this.showReveal.set(false);
      this.showPanel.set(true);
      this.panelExpanded.set(true);
      this.panelMotionActive.set(false);
      return;
    }

    this.showReveal.set(false);
    this.showPanel.set(true);
    this.panelExpanded.set(false);
    this.panelMotionActive.set(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.secondaryVisible() || this.secondaryHidden()) {
          return;
        }
        this.panelExpanded.set(true);
        this.scheduleMotionEnd();
      });
    });
  }

  private collapsePanel(): void {
    this.cancelMotionTimer();
    this.revealEntering.set(false);

    if (!this.showPanel()) {
      this.showReveal.set(true);
      this.panelExpanded.set(false);
      this.panelMotionActive.set(false);
      return;
    }

    if (!this.motionEnabled()) {
      this.showPanel.set(false);
      this.panelExpanded.set(false);
      this.panelMotionActive.set(false);
      this.showReveal.set(true);
      return;
    }

    this.panelMotionActive.set(true);
    this.panelExpanded.set(false);
    this.scheduleMotionEnd(() => {
      if (!this.secondaryHidden() || !this.secondaryVisible()) {
        return;
      }
      this.showPanel.set(false);
      this.showReveal.set(true);
      this.playRevealEnter();
    });
  }

  private resetSecondaryRegion(): void {
    this.cancelMotionTimer();
    this.showReveal.set(false);
    this.showPanel.set(false);
    this.panelExpanded.set(false);
    this.panelMotionActive.set(false);
    this.revealEntering.set(false);
  }

  private playRevealEnter(): void {
    if (!this.motionEnabled()) {
      return;
    }

    this.revealEntering.set(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.revealEntering.set(false);
      });
    });
  }

  private scheduleMotionEnd(onComplete?: () => void): void {
    this.cancelMotionTimer();
    const durationMs = this.motionEnabled() ? this.motionDurationMs() : 0;

    if (durationMs === 0) {
      onComplete?.();
      this.panelMotionActive.set(false);
      return;
    }

    this.motionTimer = setTimeout(() => {
      this.motionTimer = null;
      onComplete?.();
      if (!this.dragging) {
        this.panelMotionActive.set(false);
      }
    }, durationMs);
  }

  private cancelMotionTimer(): void {
    if (this.motionTimer !== null) {
      clearTimeout(this.motionTimer);
      this.motionTimer = null;
    }
  }

  private motionEnabled(): boolean {
    return this.document.documentElement.getAttribute('data-animation-speed') !== 'none';
  }

  private motionDurationMs(): number {
    const raw = getComputedStyle(this.document.documentElement)
      .getPropertyValue('--tx-duration-base')
      .trim();
    return parseCssDurationMs(raw) ?? SECONDARY_MOTION_MS_FALLBACK;
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

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

const MIN_SECONDARY_HEIGHT = 140;
const AUTO_HIDE_THRESHOLD = 120;

@Component({
  selector: 'tx-vertical-split-pane',
  standalone: true,
  imports: [TxIconComponent],
  template: `
    <div class="tx-vertical-split-pane">
      <div class="tx-vertical-split-pane__primary">
        <ng-content select="[txSplitPrimary]" />
      </div>
      @if (secondaryVisible() && secondaryHidden()) {
        <div class="tx-vertical-split-pane__reveal">
          <button
            type="button"
            class="tx-vertical-split-pane__reveal-pill"
            title="Show response panel"
            aria-label="Show response panel"
            (click)="handleRevealClick($event)"
          >
            <tx-icon name="chevronUp" [size]="12" aria-hidden="true" />
            <span>Response</span>
          </button>
        </div>
      }
      @if (secondaryVisible() && !secondaryHidden()) {
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
            title="Hide response panel"
            aria-label="Hide response panel"
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
          <ng-content select="[txSplitSecondary]" />
        </div>
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
  readonly secondaryHeightChange = output<number>();
  readonly secondaryHeightCommit = output<number>();
  readonly secondaryHiddenChange = output<boolean>();

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
}

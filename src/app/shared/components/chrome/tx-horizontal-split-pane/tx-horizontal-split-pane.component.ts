import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

const MIN_SECONDARY_WIDTH = 200;

@Component({
  selector: 'tx-horizontal-split-pane',
  standalone: true,
  template: `
    <div class="tx-horizontal-split-pane">
      @if (secondaryVisible()) {
        <div
          class="tx-horizontal-split-pane__secondary"
          [style.width.px]="secondaryWidth()"
          [style.flex-basis.px]="secondaryWidth()"
          [style.min-width.px]="secondaryWidth()"
          [style.max-width.px]="secondaryWidth()"
        >
          <ng-content select="[txSplitSecondary]" />
        </div>
        <div
          class="tx-horizontal-split-pane__handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          (mousedown)="handlePointerDown($event)"
        ></div>
      }
      <div class="tx-horizontal-split-pane__primary">
        <ng-content select="[txSplitPrimary]" />
      </div>
    </div>
  `,
  styleUrl: './tx-horizontal-split-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxHorizontalSplitPaneComponent {
  readonly secondaryWidth = input(288);
  readonly secondaryVisible = input(true);
  readonly secondaryMinWidth = input(MIN_SECONDARY_WIDTH);
  readonly secondaryMaxWidth = input(480);
  readonly secondaryWidthChange = output<number>();
  readonly secondaryWidthCommit = output<number>();

  protected handlePointerDown(event: MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.secondaryWidth();
    let lastWidth = startWidth;

    const onMove = (e: MouseEvent): void => {
      const delta = e.clientX - startX;
      const next = Math.min(
        this.secondaryMaxWidth(),
        Math.max(this.secondaryMinWidth(), startWidth + delta),
      );
      lastWidth = next;
      this.secondaryWidthChange.emit(next);
    };

    const onUp = (): void => {
      this.secondaryWidthCommit.emit(lastWidth);
      cleanup();
    };

    const cleanup = (): void => {
      document.body.style.removeProperty('user-select');
      document.body.style.removeProperty('cursor');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
}

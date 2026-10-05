import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { regressionRunPassRate, type RegressionRunRecord } from '@testrix/contracts';

@Component({
  selector: 'tx-rg-run-timeline',
  standalone: true,
  template: `
    <div class="rg-run-timeline" role="list" aria-label="Regression run history">
      @if (compareMode()) {
        <p class="rg-run-timeline__hint">
          Click a run for <strong>B</strong>. Shift+click for <strong>A</strong> (baseline).
        </p>
      }
      @for (run of runs(); track run.id) {
        <button
          type="button"
          class="rg-run-timeline__chip"
          role="listitem"
          [class.is-active]="!compareMode() && selectedId() === run.id"
          [class.is-pinned]="pinnedId() === run.id"
          [class.is-compare-a]="compareSelection()?.a === run.id"
          [class.is-compare-b]="compareSelection()?.b === run.id"
          [attr.aria-pressed]="!compareMode() && selectedId() === run.id"
          [attr.aria-label]="chipTitle(run)"
          (click)="handleClick(run.id, $event)"
        >
          @if (compareSelection()?.a === run.id) {
            <span class="rg-run-timeline__slot is-a">A</span>
          } @else if (compareSelection()?.b === run.id) {
            <span class="rg-run-timeline__slot is-b">B</span>
          } @else if (pinnedId() === run.id) {
            <span class="rg-run-timeline__pin" aria-hidden="true">★</span>
          } @else {
            <span
              class="rg-run-timeline__dot"
              [class.is-pass]="run.status === 'passed'"
              [class.is-fail]="run.status === 'failed' || run.status === 'cancelled'"
            ></span>
          }
          <span class="rg-run-timeline__label">{{ formatRunLabel(run) }}</span>
          <span class="rg-run-timeline__rate">{{ (regressionRunPassRate(run) * 100).toFixed(0) }}%</span>
        </button>
      }
    </div>
  `,
  styleUrl: './rg-run-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgRunTimelineComponent {
  readonly runs = input<readonly RegressionRunRecord[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly pinnedId = input<string | null>(null);
  readonly compareMode = input(false);
  readonly compareSelection = input<{ readonly a: string; readonly b: string } | null>(null);

  readonly selectedIdChange = output<string>();
  readonly compareRuns = output<{ readonly a: string; readonly b: string }>();
  readonly pinRun = output<string>();

  readonly regressionRunPassRate = regressionRunPassRate;

  handleClick(id: string, event: MouseEvent): void {
    if (event.altKey) {
      this.pinRun.emit(id);
      return;
    }
    if (this.compareMode()) {
      const selection = this.compareSelection();
      const fallbackA = this.runs()[Math.min(1, this.runs().length - 1)]?.id;
      const fallbackB = this.runs()[0]?.id;
      const currentA = selection?.a ?? fallbackA;
      const currentB = selection?.b ?? fallbackB;
      if (event.shiftKey) {
        if (currentB && id !== currentB)
          this.compareRuns.emit({ a: id, b: currentB });
        return;
      }
      if (currentA && id !== currentA)
        this.compareRuns.emit({ a: currentA, b: id });
      return;
    }
    const anchor = this.selectedId();
    if (event.shiftKey && anchor && anchor !== id) {
      this.compareRuns.emit({ a: anchor, b: id });
      return;
    }
    this.selectedIdChange.emit(id);
  }

  formatRunLabel(run: RegressionRunRecord): string {
    const date = new Date(run.at);
    const time = Number.isNaN(date.getTime())
      ? run.at
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    return `${time} · ${(regressionRunPassRate(run) * 100).toFixed(0)}%`;
  }

  chipTitle(run: RegressionRunRecord): string {
    if (this.compareMode())
      return `${run.status}. Click = B, Shift+click = A, Alt+click pin golden`;
    return `${run.status}. Shift+click compare, Alt+click pin golden`;
  }
}

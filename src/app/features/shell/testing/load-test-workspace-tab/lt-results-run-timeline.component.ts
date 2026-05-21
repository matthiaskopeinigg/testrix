import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { LoadTestRunRecord } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-lt-results-run-timeline',
  standalone: true,
  imports: [TxIconComponent, TxTagComponent],
  template: `
    <div class="lt-run-timeline" role="list" aria-label="Load test run history">
      @if (compareMode()) {
        <p class="lt-run-timeline__hint">
          Click a run for <strong>B</strong> (newer). Shift+click for <strong>A</strong> (baseline).
        </p>
      }
      @for (run of runs(); track run.id) {
        <button
          type="button"
          class="lt-run-timeline__chip"
          role="listitem"
          [class.is-active]="!compareMode() && selectedId() === run.id"
          [class.is-pinned]="pinnedId() === run.id"
          [class.is-compare-a]="compareSelection()?.a === run.id"
          [class.is-compare-b]="compareSelection()?.b === run.id"
          [attr.aria-pressed]="!compareMode() && selectedId() === run.id"
          [title]="chipTitle(run)"
          (click)="handleClick(run.id, $event)"
        >
          @if (compareSelection()?.a === run.id) {
            <span class="lt-run-timeline__slot lt-run-timeline__slot--a">A</span>
          } @else if (compareSelection()?.b === run.id) {
            <span class="lt-run-timeline__slot lt-run-timeline__slot--b">B</span>
          } @else if (pinnedId() === run.id) {
            <tx-icon name="star" [size]="12" class="lt-run-timeline__pin" aria-hidden="true" />
          } @else {
            <span
              class="lt-run-timeline__dot"
              [class.is-pass]="run.status === 'passed'"
              [class.is-fail]="run.status === 'failed' || run.status === 'cancelled'"
            ></span>
          }
          <span class="lt-run-timeline__label">{{ formatRunLabel(run) }}</span>
          <tx-tag [variant]="statusVariant(run.status)" casing="normal">{{ run.summary.successRatePercent.toFixed(1) }}%</tx-tag>
        </button>
      }
    </div>
  `,
  styleUrl: './lt-results-run-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsRunTimelineComponent {
  readonly runs = input<readonly LoadTestRunRecord[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly pinnedId = input<string | null>(null);
  readonly compareMode = input(false);
  readonly compareSelection = input<{ readonly a: string; readonly b: string } | null>(null);

  readonly selectedIdChange = output<string>();
  readonly compareRuns = output<{ readonly a: string; readonly b: string }>();
  readonly pinRun = output<string>();

  protected handleClick(id: string, event: MouseEvent): void {
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
        if (currentB && id !== currentB) {
          this.compareRuns.emit({ a: id, b: currentB });
        }
        return;
      }

      if (currentA && id !== currentA) {
        this.compareRuns.emit({ a: currentA, b: id });
      }
      return;
    }

    const anchor = this.selectedId();
    if (event.shiftKey && anchor && anchor !== id) {
      this.compareRuns.emit({ a: anchor, b: id });
      return;
    }

    this.selectedIdChange.emit(id);
  }

  protected formatRunLabel(run: LoadTestRunRecord): string {
    const date = new Date(run.startedAt);
    const time = date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${time} · ${run.summary.requestsPerSec.toFixed(0)} rps`;
  }

  protected chipTitle(run: LoadTestRunRecord): string {
    if (this.compareMode()) {
      return `${run.status} · Click = run B · Shift+click = run A · Alt+click pin baseline`;
    }
    return `${run.status} · Shift+click compare · Alt+click pin baseline`;
  }

  protected statusVariant(
    status: LoadTestRunRecord['status'],
  ): 'success' | 'warning' | 'error' | 'default' {
    if (status === 'passed') {
      return 'success';
    }
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'cancelled') {
      return 'warning';
    }
    return 'default';
  }
}

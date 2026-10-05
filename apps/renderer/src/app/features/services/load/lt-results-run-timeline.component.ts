import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { LoadRunRecord, LoadRunStatus } from '@testrix/contracts';

/**
 * Horizontal chip strip of saved runs with select, compare, and pin actions.
 *
 * Click selects a run (or run B in compare mode); Shift+click compares; and
 * Alt+click pins a baseline.
 */
@Component({
  selector: 'tx-lt-results-run-timeline',
  standalone: true,
  templateUrl: './lt-results-run-timeline.component.html',
  styleUrl: './lt-results-run-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsRunTimelineComponent {
  readonly runs = input<readonly LoadRunRecord[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly pinnedId = input<string | null>(null);
  readonly compareMode = input(false);
  readonly compareSelection = input<{ readonly a: string; readonly b: string } | null>(null);

  readonly selectedIdChange = output<string>();
  readonly compareRuns = output<{ readonly a: string; readonly b: string }>();
  readonly pinRun = output<string>();

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

  runStatus(run: LoadRunRecord): LoadRunStatus {
    return run.status ?? (run.error ? 'failed' : 'passed');
  }

  successRate(run: LoadRunRecord): number {
    if (typeof run.successRatePercent === 'number')
      return run.successRatePercent;
    return run.requests === 0 ? 0 : ((run.requests - run.errors) / run.requests) * 100;
  }

  formatRunLabel(run: LoadRunRecord): string {
    const date = new Date(run.at);
    const time = Number.isNaN(date.getTime())
      ? run.at
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    return `${time} · ${run.rps.toFixed(0)} rps`;
  }

  chipLabel(run: LoadRunRecord): string {
    if (this.compareMode())
      return `${this.runStatus(run)}. Click compare B, Shift+click compare A, Alt+click pin baseline`;
    return `${this.runStatus(run)}. Shift+click compare, Alt+click pin baseline`;
  }

  statusTone(run: LoadRunRecord): 'success' | 'warning' | 'error' | 'default' {
    const status = this.runStatus(run);
    if (status === 'passed')
      return 'success';
    if (status === 'failed')
      return 'error';
    if (status === 'cancelled')
      return 'warning';
    return 'default';
  }
}

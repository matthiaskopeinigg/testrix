import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { compareLoadRuns, type LoadMetricDelta, type LoadRunRecord } from '@testrix/contracts';

/**
 * Side-by-side comparison table for two saved runs.
 */
@Component({
  selector: 'tx-lt-results-compare-panel',
  standalone: true,
  templateUrl: './lt-results-compare-panel.component.html',
  styleUrl: './lt-results-compare-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsComparePanelComponent {
  readonly runA = input.required<LoadRunRecord>();
  readonly runB = input.required<LoadRunRecord>();

  readonly compare = computed(() => compareLoadRuns(this.runA(), this.runB()));

  runLabel(record: LoadRunRecord): string {
    const date = new Date(record.at);
    return Number.isNaN(date.getTime())
      ? record.at
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  deltaTone(row: LoadMetricDelta): 'success' | 'error' | 'default' {
    if (row.direction === 'better')
      return 'success';
    if (row.direction === 'worse')
      return 'error';
    return 'default';
  }
}

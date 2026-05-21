import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { compareLoadTestRuns, type LoadTestMetricDelta } from '@shared/testing';
import type { LoadTestRunRecord } from '@shared/testing';

import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-lt-results-compare-panel',
  standalone: true,
  imports: [TxTagComponent],
  template: `
    <section class="lt-compare-panel" aria-label="Run comparison">
      <header class="lt-compare-panel__header">
        <div>
          <h3 class="lt-compare-panel__title">Compare runs</h3>
          <p class="lt-compare-panel__subtitle">
            {{ runLabel(compare().runA) }} vs {{ runLabel(compare().runB) }}
          </p>
        </div>
      </header>

      <table class="lt-compare-panel__table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Run A</th>
            <th scope="col">Run B</th>
            <th scope="col">Delta</th>
          </tr>
        </thead>
        <tbody>
          @for (row of compare().metrics; track row.label) {
            <tr [attr.data-direction]="row.direction">
              <th scope="row">{{ row.label }}</th>
              <td>{{ row.aValue }}</td>
              <td>{{ row.bValue }}</td>
              <td>
                <tx-tag [variant]="deltaVariant(row)" casing="normal">{{ row.delta }}</tx-tag>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styleUrl: './lt-results-compare-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsComparePanelComponent {
  readonly runA = input.required<LoadTestRunRecord>();
  readonly runB = input.required<LoadTestRunRecord>();

  protected readonly compare = computed(() => compareLoadTestRuns(this.runA(), this.runB()));

  protected runLabel(record: LoadTestRunRecord): string {
    return new Date(record.startedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected deltaVariant(row: LoadTestMetricDelta): 'success' | 'warning' | 'error' | 'default' {
    if (row.direction === 'better') {
      return 'success';
    }
    if (row.direction === 'worse') {
      return 'error';
    }
    return 'default';
  }
}

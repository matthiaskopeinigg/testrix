import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { RegressionTabUi } from '@shared/config';

import type { RegressionFlowResult, RegressionRun } from '@shared/testing';
import {
  compareRegressionFlowResults,
  filterRegressionFlowDiffs,
  type RegressionFlowChangeType,
  type RegressionFlowDiff,
} from '@shared/testing';

import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

export type RgFlowDiffFilter = 'all' | 'changed' | 'regressions' | 'improvements' | 'new_failures';

@Component({
  selector: 'app-rg-results-flow-diff-table',
  standalone: true,
  imports: [TxTagComponent],
  template: `
    <section class="rg-flow-diff" aria-label="Flow comparison">
      <header class="rg-flow-diff__header">
        <h3 class="rg-flow-diff__title">Flow diffs</h3>
        <div class="rg-flow-diff__filters" role="tablist" aria-label="Flow diff filter">
          @for (option of filterOptions; track option.id) {
            <button
              type="button"
              class="rg-flow-diff__filter-btn"
              role="tab"
              [class.is-active]="filter() === option.id"
              [attr.aria-selected]="filter() === option.id"
              (click)="handleFilterSelect(option.id)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      </header>

      @if (rows().length === 0) {
        <p class="rg-flow-diff__empty">No flow differences for this filter.</p>
      } @else {
        <div class="rg-flow-diff__table-wrap">
          <table class="rg-flow-diff__table">
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Status A</th>
                <th scope="col">Status B</th>
                <th scope="col">Duration A</th>
                <th scope="col">Duration B</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.flowId) {
                <tr>
                  <td>{{ row.flowName }}</td>
                  <td>{{ row.statusA ?? '—' }}</td>
                  <td>{{ row.statusB ?? '—' }}</td>
                  <td>{{ formatDuration(row.durationA) }}</td>
                  <td>{{ formatDuration(row.durationB) }}</td>
                  <td>
                    <tx-tag [variant]="changeVariant(row.changeType)" casing="normal">
                      {{ changeLabel(row.changeType) }}
                    </tx-tag>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styleUrl: './rg-results-flow-diff-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgResultsFlowDiffTableComponent {
  readonly runA = input<RegressionRun | null>(null);
  readonly runB = input<RegressionRun | null>(null);
  readonly filter = input<RgFlowDiffFilter>('all');

  readonly filterChange = output<RgFlowDiffFilter>();

  protected readonly filterOptions: readonly { readonly id: RgFlowDiffFilter; readonly label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'changed', label: 'Changed' },
    { id: 'regressions', label: 'Regressions' },
    { id: 'improvements', label: 'Improvements' },
    { id: 'new_failures', label: 'New failures' },
  ];

  protected readonly rows = computed((): readonly RegressionFlowDiff[] => {
    const a = this.runA();
    const b = this.runB();
    if (!a || !b) {
      return [];
    }
    const diffs = compareRegressionFlowResults(a.flowResults, b.flowResults);
    return filterRegressionFlowDiffs(diffs, this.filter());
  });

  protected handleFilterSelect(next: RgFlowDiffFilter): void {
    this.filterChange.emit(next);
  }

  protected formatDuration(value: number | null): string {
    return value === null ? '—' : `${value} ms`;
  }

  protected changeLabel(changeType: RegressionFlowChangeType): string {
    return changeType.replace(/_/g, ' ');
  }

  protected changeVariant(
    changeType: RegressionFlowChangeType,
  ): 'success' | 'warning' | 'error' | 'default' {
    if (changeType === 'fixed' || changeType === 'duration_improvement') {
      return 'success';
    }
    if (
      changeType === 'new_failure' ||
      changeType === 'still_failing' ||
      changeType === 'duration_regression'
    ) {
      return 'error';
    }
    if (changeType === 'skipped_change' || changeType === 'added' || changeType === 'removed') {
      return 'warning';
    }
    return 'default';
  }
}

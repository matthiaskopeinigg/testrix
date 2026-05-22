import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { RegressionFlowResult } from '@shared/testing';

interface DurationBarRow {
  readonly flowId: string;
  readonly flowName: string;
  readonly durationMs: number;
  readonly width: number;
  readonly overThreshold: boolean;
  readonly status: RegressionFlowResult['status'];
}

@Component({
  selector: 'app-rg-results-flow-duration-bars',
  standalone: true,
  template: `
    <section class="rg-duration-bars" aria-label="Flow duration chart">
      <h3 class="rg-duration-bars__title">Flow durations</h3>
      @if (rows().length === 0) {
        <p class="rg-duration-bars__empty">No completed flows to chart.</p>
      } @else {
        <ul class="rg-duration-bars__list">
          @for (row of rows(); track row.flowId) {
            <li class="rg-duration-bars__row" [class.is-over-threshold]="row.overThreshold" [attr.data-status]="row.status">
              <span class="rg-duration-bars__label" [title]="row.flowName">{{ row.flowName }}</span>
              <div class="rg-duration-bars__track">
                <span class="rg-duration-bars__fill" [style.width.%]="row.width"></span>
              </div>
              <span class="rg-duration-bars__value">{{ row.durationMs }} ms</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './rg-results-flow-duration-bars.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgResultsFlowDurationBarsComponent {
  readonly flowResults = input<readonly RegressionFlowResult[]>([]);
  readonly durationThresholdMs = input<number | null>(null);

  protected readonly rows = computed((): readonly DurationBarRow[] => {
    const threshold = this.durationThresholdMs();
    const sorted = [...this.flowResults()]
      .filter((flow) => flow.status === 'passed' || flow.status === 'failed')
      .sort((a, b) => b.durationMs - a.durationMs);
    const max = Math.max(...sorted.map((flow) => flow.durationMs), 1);

    return sorted.map((flow) => ({
      flowId: flow.flowId,
      flowName: flow.flowName,
      durationMs: flow.durationMs,
      width: Math.max(8, (flow.durationMs / max) * 100),
      overThreshold: threshold !== null && threshold > 0 && flow.durationMs > threshold,
      status: flow.status,
    }));
  });
}

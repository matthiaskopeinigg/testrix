import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { LoadTestHealthLevel, LoadTestLatencySnapshot } from '@shared/testing';

interface LatencyBarRow {
  readonly label: string;
  readonly value: number;
  readonly width: number;
  readonly level: LoadTestHealthLevel;
}

@Component({
  selector: 'app-lt-results-latency-bars',
  standalone: true,
  template: `
    <section class="lt-latency-bars" aria-label="Latency distribution">
      @if (empty()) {
        <p class="lt-latency-bars__empty">No latency samples yet.</p>
      } @else {
        <ul class="lt-latency-bars__list">
          @for (row of rows(); track row.label) {
            <li class="lt-latency-bars__row" [attr.data-health]="row.level">
              <span class="lt-latency-bars__label">{{ row.label }}</span>
              <div class="lt-latency-bars__track">
                <span class="lt-latency-bars__fill" [style.width.%]="row.width"></span>
              </div>
              <span class="lt-latency-bars__value">{{ row.value }} ms</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styleUrl: './lt-results-latency-bars.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsLatencyBarsComponent {
  readonly latency = input.required<LoadTestLatencySnapshot>();
  readonly empty = input(false);

  protected readonly rows = computed((): readonly LatencyBarRow[] => {
    const latency = this.latency();
    const values = [
      { label: 'Average', value: latency.avg },
      { label: 'p50', value: latency.p50 },
      { label: 'p95', value: latency.p95 },
      { label: 'p99', value: latency.p99 },
    ];
    const max = Math.max(...values.map((row) => row.value), 1);
    return values.map((row) => ({
      ...row,
      width: Math.max(8, (row.value / max) * 100),
      level: latencyLevel(row.value),
    }));
  });
}

function latencyLevel(valueMs: number): LoadTestHealthLevel {
  if (valueMs <= 120) {
    return 'good';
  }
  if (valueMs <= 320) {
    return 'ok';
  }
  return 'bad';
}

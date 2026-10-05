import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LoadHealthLevel } from '@testrix/contracts';

interface LatencyBarRow {
  readonly label: string;
  readonly value: number;
  readonly width: number;
  readonly level: LoadHealthLevel;
}

/**
 * Horizontal bars comparing avg / p50 / p95 / p99 latency.
 */
@Component({
  selector: 'tx-lt-results-latency-bars',
  standalone: true,
  templateUrl: './lt-results-latency-bars.component.html',
  styleUrl: './lt-results-latency-bars.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsLatencyBarsComponent {
  readonly avgMs = input(0);
  readonly p50Ms = input(0);
  readonly p95Ms = input(0);
  readonly p99Ms = input(0);
  readonly empty = input(false);

  readonly rows = computed((): readonly LatencyBarRow[] => {
    const values = [
      { label: 'Average', value: Math.round(this.avgMs()) },
      { label: 'p50', value: Math.round(this.p50Ms()) },
      { label: 'p95', value: Math.round(this.p95Ms()) },
      { label: 'p99', value: Math.round(this.p99Ms()) },
    ];
    const max = Math.max(...values.map((row) => row.value), 1);
    return values.map((row) => ({
      ...row,
      width: Math.max(8, (row.value / max) * 100),
      level: latencyLevel(row.value),
    }));
  });
}

function latencyLevel(valueMs: number): LoadHealthLevel {
  if (valueMs <= 120)
    return 'good';
  if (valueMs <= 320)
    return 'ok';
  return 'bad';
}

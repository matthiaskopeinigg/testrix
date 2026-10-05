import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface LtLineChartStats {
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly latest: number;
}

interface ChartValueRange {
  readonly min: number;
  readonly max: number;
  readonly mid: number;
}

/**
 * Sparkline chart with an optional dashed secondary (compare) series.
 */
@Component({
  selector: 'tx-lt-results-line-chart',
  standalone: true,
  templateUrl: './lt-results-line-chart.component.html',
  styleUrl: './lt-results-line-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsLineChartComponent {
  readonly title = input.required<string>();
  readonly values = input<readonly number[]>([]);
  readonly secondaryValues = input<readonly number[]>([]);
  readonly unit = input('');
  readonly strokeColor = input('var(--tx-accent)');
  readonly secondaryStrokeColor = input('var(--tx-warning)');
  readonly primaryLabel = input('Current run');
  readonly secondaryLabel = input('Compare run');
  readonly elapsedSec = input(0);

  readonly gradientId = computed(
    () => `lt-chart-${this.title().replace(/\s+/g, '-').toLowerCase()}`,
  );

  readonly hasData = computed(() => this.values().length >= 2);

  readonly stats = computed(() => computeStats(this.values()));

  readonly secondaryStats = computed(() => {
    const secondary = this.secondaryValues();
    return secondary.length >= 2 ? computeStats(secondary) : null;
  });

  readonly combinedRange = computed((): ChartValueRange => {
    const all = [...this.values(), ...this.secondaryValues()];
    if (all.length === 0)
      return { min: 0, max: 1, mid: 0.5 };
    const min = Math.min(...all);
    const max = Math.max(...all);
    return { min, max, mid: (min + max) / 2 };
  });

  readonly yAxisTickLabels = computed((): readonly [string, string, string] | null => {
    if (!this.hasData())
      return null;
    const { min, max, mid } = this.combinedRange();
    return [formatMetric(max), formatMetric(mid), formatMetric(min)];
  });

  readonly gridLines = computed(() => {
    const range = this.combinedRange();
    return [
      valueToY(range.max, range, 44, 3),
      valueToY(range.mid, range, 44, 3),
      valueToY(range.min, range, 44, 3),
    ];
  });

  readonly linePoints = computed(() =>
    buildPolyline(this.values(), this.combinedRange(), 100, 44, 3),
  );

  readonly secondaryLinePoints = computed(() => {
    const secondary = this.secondaryValues();
    if (secondary.length < 2)
      return '';
    return buildPolyline(secondary, this.combinedRange(), 100, 44, 3);
  });

  readonly areaPoints = computed(() => {
    const line = this.linePoints();
    if (!line)
      return '';
    return `${line} 100,44 0,44`;
  });

  readonly timeAxisLabel = computed(() => {
    const elapsed = this.elapsedSec();
    if (elapsed > 0)
      return formatElapsed(elapsed);
    const sampleCount = this.values().length;
    if (sampleCount <= 1)
      return '0s';
    return formatElapsed((sampleCount - 1) * 0.5);
  });

  readonly chartAriaLabel = computed(() => {
    const stats = this.stats();
    if (!stats)
      return this.title();
    const unit = this.unit();
    return `${this.title()}. Latest ${formatMetric(stats.latest)} ${unit}. Range ${formatMetric(
      stats.min,
    )} to ${formatMetric(stats.max)} ${unit}.`;
  });

  formatValue(value: number): string {
    return formatMetric(value);
  }
}

function computeStats(values: readonly number[]): LtLineChartStats | null {
  if (values.length === 0)
    return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, avg, latest: values[values.length - 1] ?? 0 };
}

function formatMetric(value: number): string {
  if (value >= 1000)
    return `${(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value))
    return String(value);
  return value.toFixed(1);
}

function formatElapsed(sec: number): string {
  if (sec < 60)
    return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

function valueToY(value: number, range: ChartValueRange, height: number, padding: number): number {
  const span = Math.max(range.max - range.min, 0.001);
  const innerHeight = height - padding * 2;
  const normalized = (value - range.min) / span;
  return height - padding - normalized * innerHeight;
}

function buildPolyline(
  values: readonly number[],
  range: ChartValueRange,
  width: number,
  height: number,
  padding: number,
): string {
  if (values.length === 0)
    return '';
  const span = Math.max(range.max - range.min, 0.001);
  const innerHeight = height - padding * 2;
  const step = values.length <= 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const normalized = (value - range.min) / span;
      const y = height - padding - normalized * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

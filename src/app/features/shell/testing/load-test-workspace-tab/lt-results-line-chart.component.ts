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

@Component({
  selector: 'app-lt-results-line-chart',
  standalone: true,
  template: `
    <figure class="lt-line-chart">
      <figcaption class="lt-line-chart__caption">
        <span class="lt-line-chart__title">{{ title() }}</span>
        @if (stats()) {
          <span class="lt-line-chart__latest">{{ formatValue(stats()!.latest) }} {{ unit() }}</span>
        }
      </figcaption>

      @if (stats()) {
        <div class="lt-line-chart__legend" aria-label="Chart legend">
          <div class="lt-line-chart__legend-row">
            <span class="lt-line-chart__legend-item">
              <span class="lt-line-chart__legend-swatch" [style.background]="strokeColor()"></span>
              <span class="lt-line-chart__legend-label">{{ primaryLabel() }}</span>
            </span>
            <span class="lt-line-chart__legend-stat">Low {{ formatValue(stats()!.min) }}</span>
            <span class="lt-line-chart__legend-stat">Avg {{ formatValue(stats()!.avg) }}</span>
            <span class="lt-line-chart__legend-stat">High {{ formatValue(stats()!.max) }}</span>
          </div>
          @if (secondaryStats()) {
            <div class="lt-line-chart__legend-row">
              <span class="lt-line-chart__legend-item">
              <span
                  class="lt-line-chart__legend-swatch lt-line-chart__legend-swatch--dashed"
                  [style.--lt-swatch-color]="secondaryStrokeColor()"
                ></span>
                <span class="lt-line-chart__legend-label">{{ secondaryLabel() }}</span>
              </span>
              <span class="lt-line-chart__legend-stat">Low {{ formatValue(secondaryStats()!.min) }}</span>
              <span class="lt-line-chart__legend-stat">Avg {{ formatValue(secondaryStats()!.avg) }}</span>
              <span class="lt-line-chart__legend-stat">High {{ formatValue(secondaryStats()!.max) }}</span>
            </div>
          }
        </div>
      }

      <div class="lt-line-chart__plot">
        @if (yAxisTickLabels(); as ticks) {
          <div class="lt-line-chart__y-axis" aria-hidden="true">
            <span>{{ ticks[0] }}</span>
            <span>{{ ticks[1] }}</span>
            <span>{{ ticks[2] }}</span>
          </div>
        }
        <svg
          class="lt-line-chart__svg"
          viewBox="0 0 100 44"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="chartAriaLabel()"
        >
          <defs>
            <linearGradient [attr.id]="gradientId()" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" [attr.stop-color]="strokeColor()" stop-opacity="0.28" />
              <stop offset="100%" [attr.stop-color]="strokeColor()" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          @if (hasData()) {
            @for (line of gridLines(); track line) {
              <line class="lt-line-chart__grid" x1="0" [attr.y1]="line" x2="100" [attr.y2]="line" />
            }
            <polygon
              class="lt-line-chart__area"
              [attr.points]="areaPoints()"
              [attr.fill]="'url(#' + gradientId() + ')'"
            />
            <polyline
              class="lt-line-chart__line"
              [attr.points]="linePoints()"
              [attr.stroke]="strokeColor()"
            />
            @if (secondaryLinePoints()) {
              <polyline
                class="lt-line-chart__line lt-line-chart__line--secondary"
                [attr.points]="secondaryLinePoints()"
                [attr.stroke]="secondaryStrokeColor()"
              />
            }
          } @else {
            <line class="lt-line-chart__baseline" x1="0" y1="42" x2="100" y2="42" />
          }
        </svg>
      </div>

      @if (hasData()) {
        <div class="lt-line-chart__x-axis" aria-hidden="true">
          <span>0s</span>
          <span>{{ timeAxisLabel() }}</span>
        </div>
      }
    </figure>
  `,
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

  protected readonly gradientId = computed(() =>
    `lt-chart-${this.title().replace(/\s+/g, '-').toLowerCase()}`,
  );

  protected readonly hasData = computed(() => this.values().length >= 2);

  protected readonly stats = computed(() => computeStats(this.values()));

  protected readonly secondaryStats = computed(() => {
    const secondary = this.secondaryValues();
    return secondary.length >= 2 ? computeStats(secondary) : null;
  });

  protected readonly combinedRange = computed((): ChartValueRange => {
    const all = [...this.values(), ...this.secondaryValues()];
    if (all.length === 0) {
      return { min: 0, max: 1, mid: 0.5 };
    }
    const min = Math.min(...all);
    const max = Math.max(...all);
    return { min, max, mid: (min + max) / 2 };
  });

  protected readonly yAxisTickLabels = computed((): readonly [string, string, string] | null => {
    if (!this.hasData()) {
      return null;
    }
    const { min, max, mid } = this.combinedRange();
    return [formatMetric(max), formatMetric(mid), formatMetric(min)];
  });

  protected readonly gridLines = computed(() => {
    const range: ChartValueRange = this.combinedRange();
    const top = valueToY(range.max, range, 44, 3);
    const mid = valueToY(range.mid, range, 44, 3);
    const bottom = valueToY(range.min, range, 44, 3);
    return [top, mid, bottom];
  });

  protected readonly linePoints = computed(() =>
    buildPolyline(this.values(), this.combinedRange(), 100, 44, 3),
  );

  protected readonly secondaryLinePoints = computed(() => {
    const secondary = this.secondaryValues();
    if (secondary.length < 2) {
      return '';
    }
    return buildPolyline(secondary, this.combinedRange(), 100, 44, 3);
  });

  protected readonly areaPoints = computed(() => {
    const line = this.linePoints();
    if (!line) {
      return '';
    }
    return `${line} 100,44 0,44`;
  });

  protected readonly timeAxisLabel = computed(() => {
    const elapsed = this.elapsedSec();
    if (elapsed > 0) {
      return `${formatElapsed(elapsed)}`;
    }
    const sampleCount = this.values().length;
    if (sampleCount <= 1) {
      return '0s';
    }
    return `${formatElapsed((sampleCount - 1) * 0.5)}`;
  });

  protected formatValue(value: number): string {
    return formatMetric(value);
  }

  protected chartAriaLabel(): string {
    const stats = this.stats();
    if (!stats) {
      return this.title();
    }
    const unit = this.unit();
    return `${this.title()}. Latest ${formatMetric(stats.latest)} ${unit}. Range ${formatMetric(stats.min)} to ${formatMetric(stats.max)} ${unit}.`;
  }
}

function computeStats(values: readonly number[]): LtLineChartStats | null {
  if (values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, avg, latest: values[values.length - 1] ?? 0 };
}

function formatMetric(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function formatElapsed(sec: number): string {
  if (sec < 60) {
    return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  }
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

function valueToY(
  value: number,
  range: ChartValueRange,
  height: number,
  padding: number,
): number {
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
  if (values.length === 0) {
    return '';
  }
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

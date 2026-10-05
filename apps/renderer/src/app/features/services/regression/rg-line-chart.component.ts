import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'tx-rg-line-chart',
  standalone: true,
  template: `
    <figure class="rg-line-chart">
      <figcaption class="rg-line-chart__caption">
        <span>{{ title() }}</span>
        @if (stats(); as s) {
          <span>{{ formatValue(s.latest) }}{{ unit() }}</span>
        }
      </figcaption>
      <svg class="rg-line-chart__svg" viewBox="0 0 100 44" preserveAspectRatio="none" role="img" [attr.aria-label]="title()">
        @if (hasData()) {
          @for (line of gridLines; track line) {
            <line class="rg-line-chart__grid" x1="0" [attr.y1]="line" x2="100" [attr.y2]="line" />
          }
          <polyline class="rg-line-chart__line" [attr.points]="linePoints()" [attr.stroke]="strokeColor()" />
          @for (point of pointHits(); track point.id) {
            <circle
              class="rg-line-chart__point"
              [class.is-selected]="selectedPointId() === point.id"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              r="1.6"
              [attr.fill]="strokeColor()"
              (click)="pointSelected.emit(point.id)"
            />
          }
        }
      </svg>
    </figure>
  `,
  styleUrl: './rg-line-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgLineChartComponent {
  readonly title = input.required<string>();
  readonly values = input<readonly number[]>([]);
  readonly pointIds = input<readonly string[]>([]);
  readonly selectedPointId = input<string | null>(null);
  readonly unit = input('%');
  readonly strokeColor = input('var(--tx-success, #3dd68c)');
  readonly pointSelected = output<string>();

  readonly gridLines = [8, 22, 36];

  readonly hasData = computed(() => this.values().length > 0);

  readonly stats = computed(() => {
    const values = this.values();
    if (values.length === 0)
      return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { min, max, avg, latest: values[values.length - 1]! };
  });

  readonly linePoints = computed(() => {
    const values = this.values();
    if (values.length === 0)
      return '';
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = Math.max(max - min, 1);
    return values
      .map((value, index) => {
        const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
        const y = 40 - ((value - min) / span) * 32;
        return `${x},${y}`;
      })
      .join(' ');
  });

  readonly pointHits = computed(() => {
    const values = this.values();
    const ids = this.pointIds();
    if (values.length === 0)
      return [] as readonly { id: string; x: number; y: number }[];
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const span = Math.max(max - min, 1);
    return values.map((value, index) => ({
      id: ids[index] ?? `p${index}`,
      x: values.length === 1 ? 50 : (index / (values.length - 1)) * 100,
      y: 40 - ((value - min) / span) * 32,
    }));
  });

  formatValue(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RegressionRunEntry } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

interface DurationBarRow {
  readonly key: string;
  readonly label: string;
  readonly durationMs: number;
  readonly width: number;
  readonly status: RegressionRunEntry['status'];
}

@Component({
  selector: 'tx-rg-duration-bars',
  standalone: true,
  imports: [TxHintComponent],
  template: `
    <section class="rg-duration-bars" aria-label="Entry duration chart">
      <h3 class="rg-duration-bars__title">Entry durations</h3>
      @if (rows().length === 0) {
        <p class="rg-duration-bars__empty">No completed entries to chart.</p>
      } @else {
        <ul class="rg-duration-bars__list">
          @for (row of rows(); track row.key) {
            <li class="rg-duration-bars__row" [attr.data-status]="row.status">
              <tx-hint [label]="row.label" placement="top">
                <span class="rg-duration-bars__label">{{ row.label }}</span>
              </tx-hint>
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
  styleUrl: './rg-duration-bars.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgDurationBarsComponent {
  readonly entries = input<readonly RegressionRunEntry[]>([]);

  readonly rows = computed((): readonly DurationBarRow[] => {
    const sorted = [...this.entries()]
      .filter((entry) => entry.status === 'ok' || entry.status === 'error')
      .sort((a, b) => b.durationMs - a.durationMs);
    const max = Math.max(...sorted.map((entry) => entry.durationMs), 1);
    return sorted.map((entry) => ({
      key: `${entry.flowId}:${entry.scenarioId}`,
      label: `${entry.flowName} · ${entry.scenarioName}`,
      durationMs: entry.durationMs,
      width: Math.max(8, (entry.durationMs / max) * 100),
      status: entry.status,
    }));
  });
}

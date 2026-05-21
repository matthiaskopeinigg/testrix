import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { LoadTestHealthOverview } from '@shared/testing';
import { loadTestHealthTagVariant } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

@Component({
  selector: 'app-lt-results-health-overview',
  standalone: true,
  imports: [TxIconComponent, TxTagComponent],
  template: `
    <section class="lt-health-overview" [attr.data-health]="overview().level" aria-label="Run health overview">
      <div class="lt-health-overview__ring-wrap" aria-hidden="true">
        <svg class="lt-health-overview__ring" viewBox="0 0 72 72">
          <circle class="lt-health-overview__ring-track" cx="36" cy="36" r="30" />
          <circle
            class="lt-health-overview__ring-value"
            cx="36"
            cy="36"
            r="30"
            [attr.stroke-dasharray]="ringCircumference"
            [attr.stroke-dashoffset]="ringOffset()"
          />
        </svg>
        <div class="lt-health-overview__score">
          <strong>{{ overview().score }}</strong>
          <span>score</span>
        </div>
      </div>

      <div class="lt-health-overview__copy">
        <div class="lt-health-overview__title-row">
          <h3 class="lt-health-overview__title">Run health</h3>
          <tx-tag [variant]="tagVariant()" casing="normal">{{ overview().label }}</tx-tag>
        </div>
        <p class="lt-health-overview__summary">{{ overview().summary }}</p>
        <ul class="lt-health-overview__chips">
          @for (chip of healthChips(); track chip.label) {
            <li class="lt-health-chip" [attr.data-health]="chip.level">
              <tx-icon [name]="chip.icon" [size]="12" aria-hidden="true" />
              <span>{{ chip.label }}</span>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styleUrl: './lt-results-health-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsHealthOverviewComponent {
  readonly overview = input.required<LoadTestHealthOverview>();

  protected readonly ringCircumference = 2 * Math.PI * 30;

  protected readonly tagVariant = computed(() => loadTestHealthTagVariant(this.overview().level));

  protected readonly ringOffset = computed(() => {
    const score = this.overview().score;
    const progress = Math.min(100, Math.max(0, score)) / 100;
    return this.ringCircumference * (1 - progress);
  });

  protected readonly healthChips = computed(() => {
    const checks = this.overview().checks;
    const labels = ['Throughput', 'Errors', 'Latency', 'Success', 'Stability'];
    const icons = ['zap', 'warning', 'clock', 'checkCircle', 'barChart'] as const;
    return checks.slice(0, labels.length).map((check, index) => ({
      level: check.level,
      label: labels[index] ?? `Metric ${index + 1}`,
      icon: icons[index] ?? 'info',
    }));
  });
}

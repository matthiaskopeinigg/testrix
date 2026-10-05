import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { loadHealthTagTone, type LoadHealthOverview } from '@testrix/contracts';

interface HealthChip {
  readonly level: string;
  readonly label: string;
}

/**
 * Overall run-health summary with a score ring and per-metric chips.
 */
@Component({
  selector: 'tx-lt-results-health-overview',
  standalone: true,
  templateUrl: './lt-results-health-overview.component.html',
  styleUrl: './lt-results-health-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsHealthOverviewComponent {
  readonly overview = input.required<LoadHealthOverview>();

  readonly ringCircumference = 2 * Math.PI * 30;

  readonly tone = computed(() => loadHealthTagTone(this.overview().level));

  readonly ringOffset = computed(() => {
    const progress = Math.min(100, Math.max(0, this.overview().score)) / 100;
    return this.ringCircumference * (1 - progress);
  });

  readonly healthChips = computed((): readonly HealthChip[] => {
    const labels = ['Throughput', 'Errors', 'Latency', 'Success', 'Stability'];
    return this.overview()
      .checks.slice(0, labels.length)
      .map((check, index) => ({ level: check.level, label: labels[index] ?? `Metric ${index + 1}` }));
  });
}

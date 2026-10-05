import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  buildLoadHealthOverview,
  formatDurationMs as formatDuration,
  loadHealthTagTone,
  type LoadRunRecord,
  type LoadSection,
} from '@testrix/contracts';
import { TxButtonComponent } from '@testrix/ui';

import { metricsFromRunRecord } from './lt-metrics-view';

interface ConfigCard {
  readonly section: LoadSection;
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'tx-lt-overview-panel',
  standalone: true,
  imports: [TxButtonComponent],
  templateUrl: './lt-overview-panel.component.html',
  styleUrl: './lt-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly method = input('GET');
  readonly url = input('');
  readonly virtualUsers = input(0);
  readonly durationSec = input(0);
  readonly envName = input('—');
  readonly maxErrorRate = input(0);
  readonly maxP95Ms = input(0);
  readonly minSuccessRate = input(0);
  readonly minRps = input(0);
  readonly runs = input<readonly LoadRunRecord[]>([]);

  readonly openResults = output<void>();
  readonly sectionSelect = output<LoadSection>();

  readonly lastRun = computed(() => this.runs()[0] ?? null);

  readonly lastRunHealth = computed(() => {
    const run = this.lastRun();
    if (!run)
      return null;
    const overview = buildLoadHealthOverview(metricsFromRunRecord(run), {
      maxErrorRate: this.maxErrorRate(),
      maxP95Ms: this.maxP95Ms(),
      ...(this.minSuccessRate() > 0 ? { minSuccessRate: this.minSuccessRate() } : {}),
      ...(this.minRps() > 0 ? { minRps: this.minRps() } : {}),
    });
    return { score: overview.score, label: overview.label, tone: loadHealthTagTone(overview.level) };
  });

  readonly lastRunStats = computed(() => {
    const run = this.lastRun();
    if (!run)
      return [] as readonly { label: string; value: string }[];
    const success = run.requests === 0 ? 0 : ((run.requests - run.errors) / run.requests) * 100;
    return [
      { label: 'Success', value: `${success.toFixed(1)}%` },
      { label: 'RPS', value: run.rps.toFixed(1) },
      { label: 'p95', value: `${Math.round(run.p95Ms)} ms` },
      { label: 'Duration', value: formatDuration(run.durationMs) },
    ];
  });

  readonly configCards = computed((): readonly ConfigCard[] => [
    {
      section: 'target',
      label: 'Target',
      value: this.url() ? `${this.method()} ${truncate(this.url(), 36)}` : 'Not set',
    },
    {
      section: 'profile',
      label: 'Profile',
      value: `${this.virtualUsers()} VU · ${this.durationSec()}s`,
    },
    { section: 'target', label: 'Environment', value: this.envName() },
    {
      section: 'thresholds',
      label: 'Thresholds',
      value: `≤${this.maxErrorRate()}% err · ≤${this.maxP95Ms()} ms p95`,
    },
  ]);

  formatWhen(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

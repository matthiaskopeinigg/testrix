import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  formatDurationMs as formatDuration,
  regressionRunPassRate,
  type RegressionRunRecord,
  type RegressionSection,
} from '@testrix/contracts';
import { TxButtonComponent } from '@testrix/ui';

interface ConfigCard {
  readonly kind: 'section' | 'results';
  readonly section?: RegressionSection;
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'tx-rg-overview-panel',
  standalone: true,
  imports: [TxButtonComponent],
  templateUrl: './rg-overview-panel.component.html',
  styleUrl: './rg-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgOverviewPanelComponent {
  readonly description = input('');
  readonly release = input('');
  readonly tags = input<readonly string[]>([]);
  readonly entryCount = input(0);
  readonly envName = input('—');
  readonly thresholdPercent = input(0);
  readonly executionLabel = input('4 workers');
  readonly runs = input<readonly RegressionRunRecord[]>([]);
  readonly goldenRunId = input<string | null>(null);

  readonly openRuns = output<void>();
  readonly sectionSelect = output<RegressionSection>();

  readonly lastRun = computed(() => this.runs()[0] ?? null);

  readonly goldenRun = computed(() => {
    const id = this.goldenRunId();
    if (!id)
      return null;
    return this.runs().find((run) => run.id === id) ?? null;
  });

  readonly lastRunStats = computed(() => {
    const run = this.lastRun();
    if (!run)
      return [] as readonly { label: string; value: string }[];
    return [
      { label: 'Pass rate', value: `${(regressionRunPassRate(run) * 100).toFixed(1)}%` },
      { label: 'Passed', value: `${run.passed}` },
      { label: 'Failed', value: `${run.failed}` },
      { label: 'Duration', value: formatDuration(run.durationMs) },
    ];
  });

  readonly baselineDelta = computed(() => {
    const run = this.lastRun();
    const golden = this.goldenRun();
    if (!run || !golden || run.id === golden.id)
      return null;
    const passDelta = (regressionRunPassRate(run) - regressionRunPassRate(golden)) * 100;
    const durDelta = run.durationMs - golden.durationMs;
    const passSign = passDelta > 0 ? '+' : '';
    const durSign = durDelta > 0 ? '+' : '';
    return `vs golden: ${passSign}${passDelta.toFixed(0)}pp · ${durSign}${formatDuration(Math.abs(durDelta))}${durDelta < 0 ? ' faster' : durDelta > 0 ? ' slower' : ''}`;
  });

  readonly configCards = computed((): readonly ConfigCard[] => [
    { kind: 'section', section: 'pack', label: 'Flows', value: `${this.entryCount()} linked` },
    { kind: 'section', section: 'settings', label: 'Environment', value: this.envName() },
    {
      kind: 'section',
      section: 'settings',
      label: 'Fail threshold',
      value: this.thresholdPercent() === 0 ? 'Any failure' : `${this.thresholdPercent()}%`,
    },
    { kind: 'section', section: 'settings', label: 'Execution', value: this.executionLabel() },
    {
      kind: 'results',
      label: 'History',
      value: this.runs().length === 0 ? 'No runs' : `${this.runs().length} saved`,
    },
  ]);

  formatWhen(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  }
}

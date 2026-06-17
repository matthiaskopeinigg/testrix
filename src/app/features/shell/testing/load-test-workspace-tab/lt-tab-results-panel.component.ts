import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { LoadTestRunMetrics, LoadTestRunRecord, LoadTestThresholds } from '@shared/testing';
import {
  buildLoadTestHealthOverview,
  buildEmptyLoadTestHealthOverview,
  buildStartingLoadTestHealthOverview,
  compareLoadTestRunSummaries,
  createIdleLoadTestRunMetrics,
  evaluateErrorRateHealth,
  evaluateP95LatencyHealth,
  evaluatePeakThroughputHealth,
  evaluateSuccessRateHealth,
  evaluateThroughputHealth,
  loadTestHealthTagVariant,
  metricsFromRunRecord,
  smoothLoadTestMetricsForHealth,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTooltipDirective } from '@app/shared/components/tx-tooltip/tx-tooltip.directive';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { LtResultsComparePanelComponent } from './lt-results-compare-panel.component';
import { LtResultsExportToolbarComponent } from './lt-results-export-toolbar.component';
import { LtResultsHealthOverviewComponent } from './lt-results-health-overview.component';
import { LtResultsLatencyBarsComponent } from './lt-results-latency-bars.component';
import { LtResultsLineChartComponent } from './lt-results-line-chart.component';
import { LtResultsRunTimelineComponent } from './lt-results-run-timeline.component';
import { LtResultsStatCardComponent } from './lt-results-stat-card.component';

export type LtRunState = 'idle' | 'running' | 'completed';
export type LtResultsView = 'live' | 'history' | 'compare';

const STARTING_METRIC_HEALTH = {
  level: 'ok',
  label: 'OK',
  hint: 'Starting…',
} as const;

const EMPTY_METRIC_HEALTH = {
  level: 'ok',
  label: 'OK',
  hint: undefined,
} as const;

@Component({
  selector: 'app-lt-tab-results-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxConfirmDialogComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTooltipDirective,
    TxTagComponent,
    LtResultsComparePanelComponent,
    LtResultsExportToolbarComponent,
    LtResultsHealthOverviewComponent,
    LtResultsLatencyBarsComponent,
    LtResultsLineChartComponent,
    LtResultsRunTimelineComponent,
    LtResultsStatCardComponent,
  ],
  templateUrl: './lt-tab-results-panel.component.html',
  styleUrl: './lt-tab-results-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabResultsPanelComponent {
  readonly runState = input<LtRunState>('idle');
  readonly metrics = input<LoadTestRunMetrics | null>(null);
  readonly thresholds = input<LoadTestThresholds>({});
  readonly runs = input<readonly LoadTestRunRecord[]>([]);
  readonly resultsView = input<LtResultsView>('live');
  readonly selectedRunId = input<string | null>(null);
  readonly pinnedBaselineRunId = input<string | null>(null);
  readonly compareSelection = input<{ readonly a: string; readonly b: string } | null>(null);

  readonly resultsViewChange = output<LtResultsView>();
  readonly selectedRunIdChange = output<string | null>();
  readonly compareSelectionChange = output<{ readonly a: string; readonly b: string } | null>();
  readonly pinnedBaselineRunIdChange = output<string | null>();
  readonly clearRuns = output<void>();
  readonly deleteRun = output<string>();

  protected readonly clearConfirmOpen = signal(false);

  constructor() {
    effect(() => {
      if (this.resultsView() !== 'compare' || !this.canCompare() || this.compareRuns()) {
        return;
      }
      untracked(() => this.emitDefaultCompareSelection());
    });
  }

  protected readonly displayMetrics = computed(() => {
    if (this.isDashboardEmpty()) {
      return createIdleLoadTestRunMetrics();
    }

    if (this.runState() === 'running') {
      return this.metrics();
    }

    const compare = this.compareRuns();
    if (this.resultsView() === 'compare' && compare) {
      return metricsFromRunRecord(compare.b);
    }

    if (this.resultsView() === 'history') {
      const run = this.selectedHistoricalRun() ?? this.runs()[0] ?? null;
      if (run) {
        return metricsFromRunRecord(run);
      }
    }

    if (this.resultsView() === 'live' && this.selectedRunId()) {
      const run = this.selectedHistoricalRun();
      if (run) {
        return metricsFromRunRecord(run);
      }
    }

    return this.metrics();
  });

  protected readonly selectedHistoricalRun = computed(() => {
    const id = this.selectedRunId();
    if (!id) {
      return null;
    }
    return this.runs().find((run) => run.id === id) ?? null;
  });

  protected readonly compareRuns = computed(() => {
    const selection = this.compareSelection();
    if (!selection) {
      return null;
    }
    const a = this.runs().find((run) => run.id === selection.a);
    const b = this.runs().find((run) => run.id === selection.b);
    if (!a || !b) {
      return null;
    }
    return { a, b };
  });

  protected readonly canCompare = computed(() => this.runs().length >= 2);

  protected readonly runOptions = computed((): readonly TxDropdownOption[] =>
    this.runs().map((run) => ({
      value: run.id,
      label: this.formatRunOptionLabel(run),
    })),
  );

  protected readonly compareRunAId = computed(
    () =>
      this.compareSelection()?.a ??
      this.runs()[Math.min(1, Math.max(0, this.runs().length - 1))]?.id ??
      '',
  );

  protected readonly compareRunBId = computed(
    () => this.compareSelection()?.b ?? this.runs()[0]?.id ?? '',
  );

  protected readonly exportRecord = computed(() => {
    if (this.resultsView() === 'compare') {
      return this.compareRuns()?.b ?? null;
    }
    if (this.resultsView() === 'history') {
      return this.selectedHistoricalRun();
    }
    const id = this.selectedRunId();
    if (id) {
      return this.runs().find((run) => run.id === id) ?? null;
    }
    return this.runs()[0] ?? null;
  });

  protected readonly baselineRun = computed(() => {
    const id = this.pinnedBaselineRunId();
    if (!id) {
      return null;
    }
    return this.runs().find((run) => run.id === id) ?? null;
  });

  protected readonly baselineDeltas = computed(() => {
    const baseline = this.baselineRun();
    const current = this.displayMetrics();
    if (!baseline || !current || this.resultsView() !== 'live') {
      return [];
    }
    const baselineSummary = baseline.summary;
    const currentSummary = {
      successRatePercent: current.successRatePercent,
      errorRatePercent: current.errorRatePercent,
      requestsPerSec: current.requestsPerSec,
      peakRequestsPerSec: current.peakRequestsPerSec,
      totalRequests: current.totalRequests,
      failedRequests: current.failedRequests,
      latencyMs: current.latencyMs,
      elapsedSec: current.elapsedSec,
      virtualUsers: current.virtualUsers,
    };
    return compareLoadTestRunSummaries(baselineSummary, currentSummary).slice(0, 4);
  });

  protected readonly compareSecondarySamples = computed(() => {
    const compare = this.compareRuns();
    if (!compare || this.resultsView() !== 'compare') {
      return null;
    }
    return compare.a;
  });

  protected readonly statusLabel = computed(() => {
    switch (this.runState()) {
      case 'running':
        return 'Running';
      case 'completed':
        return 'Completed';
      default:
        return 'Idle';
    }
  });

  protected readonly resultsViewLabel = computed(() => {
    if (this.isDashboardEmpty()) {
      return 'No run data';
    }
    switch (this.resultsView()) {
      case 'history':
        return 'Historical run';
      case 'compare':
        return 'Run comparison';
      default:
        return this.runState() === 'running' ? 'Live metrics' : 'Latest run';
    }
  });

  protected readonly isRunStarting = computed(
    () =>
      this.runState() === 'running' &&
      (this.displayMetrics()?.totalRequests ?? 0) === 0 &&
      (this.displayMetrics()?.samples.length ?? 0) === 0,
  );

  protected readonly hasDisplayableData = computed(() => {
    if (this.runState() === 'running') {
      return true;
    }

    if (this.runs().length === 0) {
      return false;
    }

    if (this.resultsView() === 'compare') {
      return this.compareRuns() !== null;
    }

    if (this.resultsView() === 'history') {
      return (this.selectedHistoricalRun() ?? this.runs()[0] ?? null) !== null;
    }

    if (this.selectedRunId()) {
      return this.selectedHistoricalRun() !== null;
    }

    const metrics = this.metrics();
    return !!metrics && (metrics.totalRequests > 0 || metrics.samples.length > 0);
  });

  protected readonly isDashboardEmpty = computed(() => !this.hasDisplayableData());

  protected readonly elapsedLabel = computed(() => {
    const sec = this.displayMetrics()?.elapsedSec ?? 0;
    if (sec < 60) {
      return `${sec.toFixed(1)}s`;
    }
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
  });

  protected readonly healthOverview = computed(() => {
    if (this.isDashboardEmpty()) {
      return buildEmptyLoadTestHealthOverview();
    }
    if (this.isRunStarting()) {
      return buildStartingLoadTestHealthOverview();
    }
    const metrics = this.displayMetrics();
    if (!metrics) {
      return buildLoadTestHealthOverview(createIdleLoadTestRunMetrics(), this.thresholds());
    }
    return buildLoadTestHealthOverview(metrics, this.thresholds());
  });

  protected readonly overallTagVariant = computed(() =>
    loadTestHealthTagVariant(this.healthOverview().level),
  );

  protected readonly healthMetrics = computed(() => {
    const metrics = this.displayMetrics();
    if (!metrics) {
      return null;
    }
    return smoothLoadTestMetricsForHealth(metrics);
  });

  protected readonly throughputHealth = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    const m = this.healthMetrics();
    if (!m) {
      return evaluateThroughputHealth(0, this.thresholds(), 0);
    }
    return evaluateThroughputHealth(m.requestsPerSec, this.thresholds(), m.virtualUsers);
  });

  protected readonly errorHealth = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    return evaluateErrorRateHealth(this.healthMetrics()?.errorRatePercent ?? 0, this.thresholds());
  });

  protected readonly p95Health = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    return evaluateP95LatencyHealth(this.healthMetrics()?.latencyMs.p95 ?? 0, this.thresholds());
  });

  protected readonly successHealth = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    return evaluateSuccessRateHealth(
      this.healthMetrics()?.successRatePercent ?? 100,
      this.thresholds(),
    );
  });

  protected readonly peakHealth = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    const m = this.displayMetrics();
    const smoothed = this.healthMetrics();
    if (!m || !smoothed) {
      return evaluatePeakThroughputHealth(0, 0, []);
    }
    return evaluatePeakThroughputHealth(
      m.peakRequestsPerSec,
      smoothed.requestsPerSec,
      m.samples,
    );
  });

  protected readonly p50Health = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    return evaluateP95LatencyHealth(this.healthMetrics()?.latencyMs.p50 ?? 0, this.thresholds());
  });

  protected readonly avgHealth = computed(() => {
    if (this.isDashboardEmpty()) {
      return EMPTY_METRIC_HEALTH;
    }
    if (this.isRunStarting()) {
      return STARTING_METRIC_HEALTH;
    }
    return evaluateP95LatencyHealth(this.healthMetrics()?.latencyMs.avg ?? 0, this.thresholds());
  });

  protected readonly throughputSeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.requestsPerSec),
  );

  protected readonly compareThroughputSeries = computed(() =>
    (this.compareSecondarySamples()?.samples ?? []).map((sample) => sample.requestsPerSec),
  );

  protected readonly latencySeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.p95LatencyMs),
  );

  protected readonly compareLatencySeries = computed(() =>
    (this.compareSecondarySamples()?.samples ?? []).map((sample) => sample.p95LatencyMs),
  );

  protected readonly p50Series = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.p50LatencyMs),
  );

  protected readonly avgLatencySeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.avgLatencyMs),
  );

  protected readonly errorSeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.errorRatePercent),
  );

  protected readonly successSeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) =>
      Math.round((100 - sample.errorRatePercent) * 100) / 100,
    ),
  );

  protected readonly compareSuccessSeries = computed(() =>
    (this.compareSecondarySamples()?.samples ?? []).map((sample) =>
      Math.round((100 - sample.errorRatePercent) * 100) / 100,
    ),
  );

  protected readonly vuSeries = computed(() =>
    (this.displayMetrics()?.samples ?? []).map((sample) => sample.virtualUsers),
  );

  protected readonly thresholdChecks = computed(() => {
    if (this.isDashboardEmpty()) {
      return [];
    }
    const metrics = this.displayMetrics();
    const thresholds = this.thresholds();
    if (!metrics) {
      return [];
    }

    const checks: {
      readonly label: string;
      readonly value: string;
      readonly pass: boolean | null;
    }[] = [];

    if (thresholds.maxErrorRatePercent !== undefined) {
      checks.push({
        label: 'Max error rate',
        value: `${metrics.errorRatePercent.toFixed(2)}% / ${thresholds.maxErrorRatePercent}%`,
        pass: metrics.errorRatePercent <= thresholds.maxErrorRatePercent,
      });
    }

    if (thresholds.minSuccessRatePercent !== undefined) {
      checks.push({
        label: 'Min success rate',
        value: `${metrics.successRatePercent.toFixed(2)}% / ${thresholds.minSuccessRatePercent}%`,
        pass: metrics.successRatePercent >= thresholds.minSuccessRatePercent,
      });
    }

    if (thresholds.maxP95LatencyMs !== undefined) {
      checks.push({
        label: 'Max p95 latency',
        value: `${metrics.latencyMs.p95} ms / ${thresholds.maxP95LatencyMs} ms`,
        pass: metrics.latencyMs.p95 <= thresholds.maxP95LatencyMs,
      });
    }

    if (thresholds.minRequestsPerSec !== undefined) {
      checks.push({
        label: 'Min throughput',
        value: `${metrics.requestsPerSec.toFixed(1)} rps / ${thresholds.minRequestsPerSec} rps`,
        pass: metrics.requestsPerSec >= thresholds.minRequestsPerSec,
      });
    }

    return checks;
  });

  protected formatStat(value: string): string {
    return this.isDashboardEmpty() ? '—' : value;
  }

  protected handleViewChange(view: LtResultsView): void {
    if (view === 'compare') {
      if (!this.canCompare()) {
        return;
      }
      if (!this.compareRuns()) {
        this.emitDefaultCompareSelection();
        return;
      }
    }
    this.resultsViewChange.emit(view);
  }

  protected handleCompareRunAChange(runId: string): void {
    const bId = this.compareRunBId();
    if (!runId || !bId || runId === bId) {
      return;
    }
    this.handleCompareSelection({ a: runId, b: bId });
  }

  protected handleCompareRunBChange(runId: string): void {
    const aId = this.compareRunAId();
    if (!runId || !aId || runId === aId) {
      return;
    }
    this.handleCompareSelection({ a: aId, b: runId });
  }

  protected handleSwapCompareRuns(): void {
    const selection = this.compareSelection();
    if (!selection) {
      return;
    }
    this.handleCompareSelection({ a: selection.b, b: selection.a });
  }

  protected handleSelectedRunChange(runId: string): void {
    this.selectedRunIdChange.emit(runId);
    this.resultsViewChange.emit('history');
  }

  protected handleCompareSelection(selection: { readonly a: string; readonly b: string }): void {
    this.compareSelectionChange.emit(selection);
    this.resultsViewChange.emit('compare');
  }

  private emitDefaultCompareSelection(): void {
    const runs = this.runs();
    if (runs.length < 2) {
      return;
    }
    this.handleCompareSelection({
      a: runs[Math.min(1, runs.length - 1)]!.id,
      b: runs[0]!.id,
    });
  }

  private formatRunOptionLabel(run: LoadTestRunRecord): string {
    const time = new Date(run.startedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${time} · ${run.summary.requestsPerSec.toFixed(1)} rps · ${run.summary.successRatePercent.toFixed(1)}%`;
  }

  protected handlePinRun(runId: string): void {
    this.pinnedBaselineRunIdChange.emit(runId);
  }

  protected handleClearRunsRequest(): void {
    this.clearConfirmOpen.set(true);
  }

  protected handleClearRunsConfirm(): void {
    this.clearConfirmOpen.set(false);
    this.clearRuns.emit();
  }

  protected handleClearRunsCancel(): void {
    this.clearConfirmOpen.set(false);
  }
}

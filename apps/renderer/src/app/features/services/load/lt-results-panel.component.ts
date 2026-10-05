import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, type AnimationCallbackEvent } from '@angular/core';
import {
  buildEmptyLoadHealthOverview,
  buildLoadHealthOverview,
  buildStartingLoadHealthOverview,
  compareLoadRunSummaries,
  evaluateErrorRateHealth,
  evaluateLoadThresholds,
  evaluateP95LatencyHealth,
  evaluatePeakThroughputHealth,
  evaluateSuccessRateHealth,
  evaluateThroughputHealth,
  loadHealthTagTone,
  loadHealthThresholdsOf,
  loadRunSummaryOf,
  smoothLoadMetricsForHealth,
  type LoadArtifactFields,
  type LoadHealthThresholds,
  type LoadMetricDelta,
  type LoadMetrics,
  type LoadRunRecord,
} from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, TxHintComponent, TxSelectComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import {
  emptyLtDisplayMetrics,
  metricsFromLive,
  metricsFromRunRecord,
  sampleElapsedSec,
  sampleErrorRatePercent,
  type LtDisplayMetrics,
} from './lt-metrics-view';
import { LtResultsComparePanelComponent } from './lt-results-compare-panel.component';
import { LtResultsExportToolbarComponent, type LtExportArtifact } from './lt-results-export-toolbar.component';
import { LtResultsHealthOverviewComponent } from './lt-results-health-overview.component';
import { LtResultsLatencyBarsComponent } from './lt-results-latency-bars.component';
import { LtResultsLineChartComponent } from './lt-results-line-chart.component';
import { LtResultsRunTimelineComponent } from './lt-results-run-timeline.component';
import { LtResultsStatCardComponent } from './lt-results-stat-card.component';

export type LtResultsView = 'live' | 'history' | 'compare';
export type LtRunState = 'idle' | 'running' | 'completed';

const LT_VIEWS: readonly LtResultsView[] = ['live', 'history', 'compare'];

const EMPTY_METRIC_HEALTH = { level: 'ok', label: 'OK', hint: undefined } as const;
const STARTING_METRIC_HEALTH = { level: 'ok', label: 'OK', hint: 'Starting…' } as const;

@Component({
  selector: 'tx-lt-results-panel',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TxButtonComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxSelectComponent,
    LtResultsComparePanelComponent,
    LtResultsExportToolbarComponent,
    LtResultsHealthOverviewComponent,
    LtResultsLatencyBarsComponent,
    LtResultsLineChartComponent,
    LtResultsRunTimelineComponent,
    LtResultsStatCardComponent,
  ],
  templateUrl: './lt-results-panel.component.html',
  styleUrl: './lt-results-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsPanelComponent {
  private readonly confirm = inject(ConfirmDialogService);

  readonly runs = input<readonly LoadRunRecord[]>([]);
  readonly running = input(false);
  readonly liveMetrics = input<LoadMetrics | null>(null);
  readonly artifactName = input('Load');
  readonly artifact = input<(LoadArtifactFields & { readonly id: string; readonly name: string }) | null>(null);

  readonly clearHistory = output<void>();
  readonly rerun = output<void>();
  readonly hide = output<void>();
  readonly resizeStart = output<PointerEvent>();

  readonly resultsView = signal<LtResultsView>('live');
  readonly viewSlideDir = signal<'left' | 'right' | null>(null);
  readonly selectedRunId = signal<string | null>(null);
  readonly pinnedBaselineRunId = signal<string | null>(null);
  readonly compareSelection = signal<{ readonly a: string; readonly b: string } | null>(null);

  readonly viewOptions = [
    { value: 'live', label: 'Live' },
    { value: 'history', label: 'History' },
    { value: 'compare', label: 'Compare' },
  ];

  constructor() {
    // Jump to the Live view whenever a run starts.
    effect(() => {
      if (this.running())
        untracked(() => {
          this.viewSlideDir.set(null);
          this.resultsView.set('live');
        });
    });
  }

  // --- Threshold config -------------------------------------------------------

  readonly thresholds = computed((): LoadHealthThresholds => {
    const artifact = this.artifact();
    return artifact ? loadHealthThresholdsOf(artifact) : {};
  });

  // --- Selection helpers ------------------------------------------------------

  readonly selectedHistoricalRun = computed(() => {
    const id = this.selectedRunId();
    if (!id)
      return null;
    return this.runs().find((run) => run.id === id) ?? null;
  });

  readonly compareRuns = computed(() => {
    const selection = this.compareSelection();
    if (!selection)
      return null;
    const a = this.runs().find((run) => run.id === selection.a);
    const b = this.runs().find((run) => run.id === selection.b);
    if (!a || !b)
      return null;
    return { a, b };
  });

  readonly canCompare = computed(() => this.runs().length >= 2);

  readonly timelineSelectedId = computed(() => this.selectedRunId() ?? this.runs()[0]?.id ?? null);

  readonly baselineRun = computed(() => {
    const id = this.pinnedBaselineRunId();
    if (!id)
      return null;
    return this.runs().find((run) => run.id === id) ?? null;
  });

  // --- Run state --------------------------------------------------------------

  readonly hasDisplayableData = computed(() => {
    if (this.running())
      return true;
    if (this.resultsView() === 'compare')
      return this.compareRuns() !== null;
    if (this.resultsView() === 'history')
      return (this.selectedHistoricalRun() ?? this.runs()[0] ?? null) !== null;
    const metrics = this.liveMetrics();
    if (metrics && (metrics.requests > 0 || metrics.samples.length > 0))
      return true;
    return this.runs().length > 0;
  });

  readonly isDashboardEmpty = computed(() => !this.hasDisplayableData());

  readonly runState = computed((): LtRunState => {
    if (this.running())
      return 'running';
    return this.isDashboardEmpty() ? 'idle' : 'completed';
  });

  readonly statusLabel = computed(() => {
    switch (this.runState()) {
      case 'running':
        return 'Running';
      case 'completed':
        return 'Completed';
      default:
        return 'Idle';
    }
  });

  // --- Display metrics --------------------------------------------------------

  readonly displayMetrics = computed((): LtDisplayMetrics => {
    if (this.isDashboardEmpty())
      return emptyLtDisplayMetrics();
    if (this.running()) {
      const live = this.liveMetrics();
      return live ? metricsFromLive(live) : emptyLtDisplayMetrics();
    }
    const compare = this.compareRuns();
    if (this.resultsView() === 'compare' && compare)
      return metricsFromRunRecord(compare.b);
    if (this.resultsView() === 'history') {
      const run = this.selectedHistoricalRun() ?? this.runs()[0] ?? null;
      return run ? metricsFromRunRecord(run) : emptyLtDisplayMetrics();
    }
    // Live: prefer live snapshot, else latest saved run as last result — never the history selection.
    const live = this.liveMetrics();
    if (live && (live.requests > 0 || live.samples.length > 0))
      return metricsFromLive(live);
    const latest = this.runs()[0];
    return latest ? metricsFromRunRecord(latest) : emptyLtDisplayMetrics();
  });

  /** Chronological series across saved runs (oldest → newest) for History trends. */
  readonly chronologicalRuns = computed(() => [...this.runs()].reverse());

  readonly historyThroughputSeries = computed(() => this.chronologicalRuns().map((run) => run.rps));

  readonly historyP95Series = computed(() => this.chronologicalRuns().map((run) => run.p95Ms));

  readonly historySuccessSeries = computed(() =>
    this.chronologicalRuns().map((run) => {
      if (run.successRatePercent !== undefined)
        return run.successRatePercent;
      if (run.requests === 0)
        return 0;
      return ((run.requests - run.errors) / run.requests) * 100;
    }),
  );

  readonly hasHistoryTrends = computed(() => this.runs().length >= 2);

  readonly healthMetrics = computed(() => smoothLoadMetricsForHealth(this.displayMetrics()));

  readonly isRunStarting = computed(
    () =>
      this.runState() === 'running' &&
      this.displayMetrics().requests === 0 &&
      this.displayMetrics().samples.length === 0,
  );

  readonly elapsedLabel = computed(() => {
    const sec = this.displayMetrics().elapsedSec;
    if (sec < 60)
      return `${sec.toFixed(1)}s`;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
  });

  // --- Health -----------------------------------------------------------------

  readonly healthOverview = computed(() => {
    if (this.isDashboardEmpty())
      return buildEmptyLoadHealthOverview();
    if (this.isRunStarting())
      return buildStartingLoadHealthOverview();
    return buildLoadHealthOverview(this.displayMetrics(), this.thresholds());
  });

  readonly overallTagTone = computed(() => loadHealthTagTone(this.healthOverview().level));

  readonly throughputHealth = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    const m = this.healthMetrics();
    return evaluateThroughputHealth(m.rps, this.thresholds(), m.virtualUsers);
  });

  readonly errorHealth = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    return evaluateErrorRateHealth(this.healthMetrics().errorRatePercent, this.thresholds());
  });

  readonly p95Health = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    return evaluateP95LatencyHealth(this.healthMetrics().p95Ms, this.thresholds());
  });

  readonly successHealth = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    return evaluateSuccessRateHealth(this.healthMetrics().successRatePercent, this.thresholds());
  });

  readonly peakHealth = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    const m = this.displayMetrics();
    return evaluatePeakThroughputHealth(m.peakRps, this.healthMetrics().rps, m.samples);
  });

  readonly p50Health = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    return evaluateP95LatencyHealth(this.healthMetrics().p50Ms, this.thresholds());
  });

  readonly avgHealth = computed(() => {
    if (this.isDashboardEmpty())
      return EMPTY_METRIC_HEALTH;
    if (this.isRunStarting())
      return STARTING_METRIC_HEALTH;
    return evaluateP95LatencyHealth(this.healthMetrics().avgMs, this.thresholds());
  });

  // --- Series -----------------------------------------------------------------

  readonly compareSecondary = computed(() => {
    const compare = this.compareRuns();
    if (!compare || this.resultsView() !== 'compare')
      return null;
    return compare.a;
  });

  readonly throughputSeries = computed(() => this.displayMetrics().samples.map((s) => s.rps));
  readonly compareThroughputSeries = computed(() => (this.compareSecondary()?.samples ?? []).map((s) => s.rps));
  readonly latencySeries = computed(() => this.displayMetrics().samples.map((s) => s.p95Ms));
  readonly compareLatencySeries = computed(() => (this.compareSecondary()?.samples ?? []).map((s) => s.p95Ms));
  readonly p50Series = computed(() => this.displayMetrics().samples.map((s) => s.p50Ms));
  readonly avgLatencySeries = computed(() => this.displayMetrics().samples.map((s) => s.avgMs ?? 0));
  readonly errorSeries = computed(() => this.displayMetrics().samples.map(sampleErrorRatePercent));
  readonly successSeries = computed(() =>
    this.displayMetrics().samples.map((s) => Math.round((100 - sampleErrorRatePercent(s)) * 100) / 100),
  );
  readonly compareSuccessSeries = computed(() =>
    (this.compareSecondary()?.samples ?? []).map((s) => Math.round((100 - sampleErrorRatePercent(s)) * 100) / 100),
  );
  readonly vuSeries = computed(() => this.displayMetrics().samples.map((s) => s.virtualUsers ?? 0));

  // --- Threshold checks -------------------------------------------------------

  readonly thresholdChecks = computed(() => {
    const artifact = this.artifact();
    if (!artifact || this.isDashboardEmpty())
      return [];
    const m = this.displayMetrics();
    return evaluateLoadThresholds(artifact, {
      requests: m.requests,
      errors: m.errors,
      p95Ms: m.p95Ms,
      rps: m.rps,
    });
  });

  // --- Compare / baseline -----------------------------------------------------

  readonly baselineDeltas = computed((): readonly LoadMetricDelta[] => {
    const baseline = this.baselineRun();
    if (!baseline || this.resultsView() !== 'live')
      return [];
    const current = this.displayMetrics();
    const currentSummary = {
      successRatePercent: current.successRatePercent,
      errorRatePercent: current.errorRatePercent,
      rps: current.rps,
      peakRps: current.peakRps,
      requests: current.requests,
      errors: current.errors,
      avgMs: current.avgMs,
      p50Ms: current.p50Ms,
      p95Ms: current.p95Ms,
      p99Ms: current.p99Ms,
      virtualUsers: current.virtualUsers,
    };
    return compareLoadRunSummaries(loadRunSummaryOf(baseline), currentSummary).slice(0, 4);
  });

  readonly runOptions = computed(() =>
    this.runs().map((run) => ({ value: run.id, label: this.formatRunOptionLabel(run) })),
  );

  readonly compareRunAId = computed(
    () =>
      this.compareSelection()?.a ??
      this.runs()[Math.min(1, Math.max(0, this.runs().length - 1))]?.id ??
      '',
  );

  readonly compareRunBId = computed(() => this.compareSelection()?.b ?? this.runs()[0]?.id ?? '');

  readonly exportRecord = computed((): LoadRunRecord | null => {
    if (this.resultsView() === 'compare')
      return this.compareRuns()?.b ?? null;
    if (this.resultsView() === 'history')
      return this.selectedHistoricalRun() ?? this.runs()[0] ?? null;
    return this.runs()[0] ?? null;
  });

  readonly exportArtifact = computed((): LtExportArtifact | null => this.artifact());

  readonly deltaTone = (delta: LoadMetricDelta): 'success' | 'error' | 'default' => {
    if (delta.direction === 'better')
      return 'success';
    if (delta.direction === 'worse')
      return 'error';
    return 'default';
  };

  // --- Handlers ---------------------------------------------------------------

  formatStat(value: string): string {
    return this.isDashboardEmpty() ? '—' : value;
  }

  handleViewChange(view: string): void {
    if (view !== 'live' && view !== 'history' && view !== 'compare')
      return;
    if (view === this.resultsView())
      return;
    if (view === 'compare') {
      if (!this.canCompare())
        return;
      if (!this.compareRuns())
        this.emitDefaultCompareSelection();
    }
    if (view === 'history' && !this.selectedRunId() && this.runs().length > 0)
      this.selectedRunId.set(this.runs()[0]!.id);
    const from = LT_VIEWS.indexOf(this.resultsView());
    const to = LT_VIEWS.indexOf(view);
    this.viewSlideDir.set(to >= from ? 'right' : 'left');
    this.resultsView.set(view);
  }

  handleViewEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.viewSlideDir());
  }

  handleViewLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.viewSlideDir());
  }

  handleSelectedRunChange(runId: string): void {
    this.selectedRunId.set(runId || null);
    this.handleViewChange('history');
  }

  handleCompareRunAChange(runId: string): void {
    const bId = this.compareRunBId();
    if (!runId || !bId || runId === bId)
      return;
    this.compareSelection.set({ a: runId, b: bId });
    this.handleViewChange('compare');
  }

  handleCompareRunBChange(runId: string): void {
    const aId = this.compareRunAId();
    if (!runId || !aId || runId === aId)
      return;
    this.compareSelection.set({ a: aId, b: runId });
    this.handleViewChange('compare');
  }

  handleSwapCompareRuns(): void {
    const selection = this.compareSelection();
    if (!selection)
      return;
    this.compareSelection.set({ a: selection.b, b: selection.a });
  }

  handleTimelineSelect(runId: string): void {
    this.selectedRunId.set(runId);
    if (this.resultsView() !== 'history' && this.resultsView() !== 'compare')
      this.handleViewChange('history');
  }

  handleTimelineCompare(selection: { readonly a: string; readonly b: string }): void {
    this.compareSelection.set(selection);
    this.handleViewChange('compare');
  }

  handlePinRun(runId: string): void {
    this.pinnedBaselineRunId.set(this.pinnedBaselineRunId() === runId ? null : runId);
  }

  async handleClearHistory(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Clear run history?',
      body: 'This removes all saved runs for this load test. This action cannot be undone.',
      confirmLabel: 'Clear history',
    });
    if (ok)
      this.clearHistory.emit();
  }

  formatRunOptionLabel(run: LoadRunRecord): string {
    const date = new Date(run.at);
    const time = Number.isNaN(date.getTime())
      ? run.at
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const success =
      run.successRatePercent ?? (run.requests === 0 ? 0 : ((run.requests - run.errors) / run.requests) * 100);
    return `${time} · ${run.rps.toFixed(1)} rps · ${success.toFixed(1)}%`;
  }

  private emitDefaultCompareSelection(): void {
    const runs = this.runs();
    if (runs.length < 2)
      return;
    this.compareSelection.set({ a: runs[Math.min(1, runs.length - 1)]!.id, b: runs[0]!.id });
  }

  protected readonly sampleElapsedSec = sampleElapsedSec;
}

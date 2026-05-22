import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  RegressionFlowResult,
  RegressionFlowTimelineEntry,
  RegressionRun,
  RegressionRunMetrics,
  RegressionThresholds,
} from '@shared/testing';
import type { RegressionTabUi } from '@shared/config';
import {
  buildRegressionHealthOverview,
  compareRegressionRunSummaries,
  compareRegressionRuns,
  createIdleRegressionRunMetrics,
  createDefaultRegressionProfile,
  regressionHealthTagVariant,
} from '@shared/testing';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { RgResultsExportToolbarComponent } from './rg-results-export-toolbar.component';
import { RgResultsFlowDurationBarsComponent } from './rg-results-flow-duration-bars.component';
import { RgResultsFlowDiffTableComponent } from './rg-results-flow-diff-table.component';
import { RgResultsGanttChartComponent } from './rg-results-gantt-chart.component';
import { RgResultsLineChartComponent } from './rg-results-line-chart.component';
import { RgResultsRunTimelineComponent } from './rg-results-run-timeline.component';
import { RgResultsStatCardComponent } from './rg-results-stat-card.component';
import { RgFlowStepDiffPanelComponent } from './rg-flow-step-diff-panel.component';
import { RgStepCaptureDiffPanelComponent } from './rg-step-capture-diff-panel.component';

export type RgRunState = 'idle' | 'running' | 'completed';
export type RgResultsView = 'live' | 'history' | 'compare';

type RgResultsSectionId =
  | 'compareSummary'
  | 'compareFlowDiff'
  | 'baselineDeltas'
  | 'thresholdChecks'
  | 'stats'
  | 'charts'
  | 'flowResults'
  | 'liveBanner';

@Component({
  selector: 'app-rg-tab-results-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxConfirmDialogComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    RgResultsRunTimelineComponent,
    RgResultsStatCardComponent,
    RgResultsGanttChartComponent,
    RgResultsLineChartComponent,
    RgResultsFlowDurationBarsComponent,
    RgResultsExportToolbarComponent,
    RgResultsFlowDiffTableComponent,
    RgFlowStepDiffPanelComponent,
    RgStepCaptureDiffPanelComponent,
  ],
  templateUrl: './rg-tab-results-panel.component.html',
  styleUrl: './rg-tab-results-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgTabResultsPanelComponent {
  protected readonly Math = Math;

  readonly runState = input<RgRunState>('idle');
  readonly metrics = input<RegressionRunMetrics | null>(null);
  readonly thresholds = input<RegressionThresholds>({ acceptancePercent: 100 });
  readonly runs = input<readonly RegressionRun[]>([]);
  readonly resultsView = input<RgResultsView>('live');
  readonly selectedRunId = input<string | null>(null);
  readonly pinnedBaselineRunId = input<string | null>(null);
  readonly compareSelection = input<{ readonly a: string; readonly b: string } | null>(null);
  readonly liveFlowTimeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly liveFlowResults = input<readonly RegressionFlowResult[]>([]);
  readonly canRerunFailed = input(false);
  readonly rerunFailedLabel = input('Rerun failed');
  readonly diffFilter = input<RegressionTabUi['diffFilter']>('all');
  readonly selectedFlowDiffId = input<string | null>(null);
  readonly selectedStepDiffId = input<string | null>(null);
  readonly captureDiffNormalizeJson = input(true);

  readonly resultsViewChange = output<RgResultsView>();
  readonly selectedRunIdChange = output<string | null>();
  readonly compareSelectionChange = output<{ readonly a: string; readonly b: string } | null>();
  readonly pinnedBaselineRunIdChange = output<string | null>();
  readonly diffFilterChange = output<RegressionTabUi['diffFilter']>();
  readonly selectedFlowDiffIdChange = output<string | null>();
  readonly selectedStepDiffIdChange = output<string | null>();
  readonly captureDiffNormalizeJsonChange = output<boolean>();
  readonly clearRuns = output<void>();
  readonly deleteRun = output<string>();
  readonly rerunFailed = output<RegressionRun | undefined>();

  protected readonly clearConfirmOpen = signal(false);
  protected readonly collapsedSections = signal<Partial<Record<RgResultsSectionId, boolean>>>({});

  constructor() {
    effect(() => {
      if (this.resultsView() !== 'compare' || !this.canCompare() || this.compareRuns()) {
        return;
      }
      untracked(() => this.emitDefaultCompareSelection());
    });

    effect(() => {
      if (this.runState() !== 'running') {
        return;
      }
      untracked(() => {
        this.collapsedSections.update((state) => ({
          ...state,
          charts: false,
          flowResults: false,
          liveBanner: false,
        }));
      });
    });
  }

  protected readonly displayRun = computed((): RegressionRun | null => {
    if (this.resultsView() === 'compare') {
      return this.compareRuns()?.b ?? null;
    }
    if (this.resultsView() === 'history') {
      return this.selectedHistoricalRun() ?? this.runs()[0] ?? null;
    }
    if (this.selectedRunId()) {
      return this.selectedHistoricalRun();
    }
    if (this.runState() === 'running') {
      const m = this.metrics();
      if (!m?.runId) {
        return null;
      }
      return {
        id: m.runId,
        startedAt: new Date(Date.now() - m.elapsedSec * 1000).toISOString(),
        status: 'running' as const,
        passedCount: m.passed,
        failedCount: m.failed,
        skippedCount: m.skipped,
        profileSnapshot: createDefaultRegressionProfile(),
        thresholdsSnapshot: this.thresholds(),
        flowResults: [...this.liveFlowResults()],
        flowTimeline: [...this.liveFlowTimeline()],
        samples: m.samples,
        thresholdResults: [],
      };
    }
    return this.runs()[0] ?? null;
  });

  protected readonly displayMetrics = computed(() => {
    if (this.runState() === 'running') {
      return this.metrics() ?? createIdleRegressionRunMetrics();
    }
    const run = this.displayRun();
    if (run) {
      return {
        ...createIdleRegressionRunMetrics(),
        running: false,
        completed: run.passedCount + run.failedCount + run.skippedCount,
        total: run.flowResults.length,
        passed: run.passedCount,
        failed: run.failedCount,
        skipped: run.skippedCount,
        passRatePercent: run.summary?.passRatePercent ?? 0,
        acceptancePercent: run.summary?.acceptancePercent ?? this.thresholds().acceptancePercent,
        elapsedSec: (run.summary?.totalDurationMs ?? 0) / 1000,
        samples: run.samples,
      };
    }
    return this.metrics() ?? createIdleRegressionRunMetrics();
  });

  protected readonly flowResults = computed((): readonly RegressionFlowResult[] => {
    if (this.runState() === 'running') {
      return this.liveFlowResults();
    }
    const run = this.displayRun();
    if (run) {
      return run.flowResults;
    }
    return [];
  });

  protected readonly exportRecord = computed(() => this.displayRun());

  protected readonly compareExportRecord = computed(() => {
    if (this.resultsView() !== 'compare') {
      return null;
    }
    return this.compareRuns()?.a ?? null;
  });

  protected readonly ganttTimeline = computed(() => this.displayRun()?.flowTimeline ?? []);

  protected readonly compareGanttTimeline = computed(() => {
    if (this.resultsView() !== 'compare') {
      return [];
    }
    return this.compareRuns()?.a?.flowTimeline ?? [];
  });

  protected readonly ganttTotalDurationMs = computed(() => {
    const run = this.displayRun();
    return run?.summary?.totalDurationMs ?? Math.max(this.displayMetrics().elapsedSec * 1000, 1);
  });

  protected readonly passRateSeries = computed(() => {
    const run = this.displayRun();
    const liveSamples = this.runState() === 'running' ? this.metrics()?.samples : null;
    const samples = liveSamples ?? run?.samples ?? [];
    return samples.map((sample) => sample.passRatePercent);
  });

  protected readonly parallelismSeries = computed(() => {
    const run = this.displayRun();
    const liveSamples = this.runState() === 'running' ? this.metrics()?.samples : null;
    const samples = liveSamples ?? run?.samples ?? [];
    return samples.map((sample) => sample.activeParallelism);
  });

  protected readonly comparePassRateSeries = computed(() => {
    if (this.resultsView() !== 'compare') {
      return [];
    }
    return this.compareRuns()?.a?.samples.map((sample) => sample.passRatePercent) ?? [];
  });

  protected readonly selectedFlowName = computed(() => {
    const flowId = this.selectedFlowDiffId();
    if (!flowId) {
      return '';
    }
    return this.flowResults().find((flow) => flow.flowId === flowId)?.flowName ?? flowId;
  });

  protected readonly avgDurationSeries = computed(() => {
    const run = this.displayRun();
    const liveSamples = this.runState() === 'running' ? this.metrics()?.samples : null;
    const samples = liveSamples ?? run?.samples ?? [];
    return samples.map((sample) => sample.avgFlowDurationMs);
  });

  protected readonly thresholdChecks = computed(() => {
    const run = this.displayRun();
    if (!run?.thresholdResults?.length) {
      return [];
    }
    return run.thresholdResults.map((result) => ({
      label: result.label,
      value: `${result.actual} / ${result.expected}`,
      pass: result.pass,
    }));
  });

  protected readonly baselineDeltas = computed(() => {
    const pinnedId = this.pinnedBaselineRunId();
    const current = this.displayRun();
    if (!pinnedId || !current?.summary || pinnedId === current.id) {
      return [];
    }
    const baseline = this.runs().find((run) => run.id === pinnedId);
    if (!baseline?.summary) {
      return [];
    }
    return compareRegressionRunSummaries(baseline.summary, current.summary);
  });

  protected readonly rerunReferenceRun = computed(() => {
    if (this.resultsView() === 'history') {
      return this.displayRun() ?? undefined;
    }
    return this.runs()[0];
  });

  protected readonly durationThresholdMs = computed(
    () => this.thresholds().maxP95FlowDurationMs ?? null,
  );

  protected handleRerunFailedClick(): void {
    this.rerunFailed.emit(this.rerunReferenceRun());
  }

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

  protected readonly compareDeltas = computed(() => {
    const compare = this.compareRuns();
    if (!compare) {
      return [];
    }
    return compareRegressionRuns(compare.a, compare.b).metrics;
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

  protected readonly healthOverview = computed(() => {
    const run = this.displayRun();
    if (run?.summary) {
      return buildRegressionHealthOverview(run.summary);
    }
    if (this.runState() === 'running') {
      const m = this.displayMetrics();
      return buildRegressionHealthOverview({
        totalDurationMs: m.elapsedSec * 1000,
        passRatePercent: m.passRatePercent,
        acceptancePercent: m.acceptancePercent,
        meetsAcceptance: m.passRatePercent >= m.acceptancePercent,
        acceptanceMarginPercent: m.passRatePercent - m.acceptancePercent,
        avgFlowDurationMs: 0,
        p50FlowDurationMs: 0,
        p95FlowDurationMs: 0,
        peakParallelism: m.activeParallelism,
        totalSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
      });
    }
    return null;
  });

  protected readonly overallTagVariant = computed(() => {
    const health = this.healthOverview();
    if (!health) {
      return 'default' as const;
    }
    return regressionHealthTagVariant(health.level);
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
        return this.runState() === 'running' ? 'Live progress' : 'Latest run';
    }
  });

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
    return this.displayRun() !== null;
  });

  protected readonly isDashboardEmpty = computed(() => !this.hasDisplayableData());

  protected readonly elapsedLabel = computed(() => {
    const sec = this.displayMetrics().elapsedSec ?? 0;
    if (sec < 60) {
      return `${sec.toFixed(1)}s`;
    }
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
  });

  protected formatStat(value: string): string {
    return this.isDashboardEmpty() ? '—' : value;
  }

  protected isSectionCollapsed(sectionId: RgResultsSectionId): boolean {
    return this.collapsedSections()[sectionId] ?? false;
  }

  protected handleToggleSection(sectionId: RgResultsSectionId): void {
    this.collapsedSections.update((state) => ({
      ...state,
      [sectionId]: !this.isSectionCollapsed(sectionId),
    }));
  }

  protected flowStatusVariant(
    status: RegressionFlowResult['status'],
  ): 'success' | 'warning' | 'error' | 'default' {
    if (status === 'passed') {
      return 'success';
    }
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'cancelled' || status === 'skipped') {
      return 'warning';
    }
    return 'default';
  }

  protected handleViewChange(view: RgResultsView): void {
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
    this.selectedFlowDiffIdChange.emit(null);
    this.selectedStepDiffIdChange.emit(null);
    this.resultsViewChange.emit('history');
  }

  protected handleCompareSelection(selection: { readonly a: string; readonly b: string }): void {
    this.compareSelectionChange.emit(selection);
    this.resultsViewChange.emit('compare');
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

  protected handleFlowSelected(flowId: string): void {
    this.selectedFlowDiffIdChange.emit(flowId);
  }

  protected handleClearRunsCancel(): void {
    this.clearConfirmOpen.set(false);
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

  private formatRunOptionLabel(run: RegressionRun): string {
    const time = new Date(run.startedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const passRate = run.summary?.passRatePercent ?? 0;
    return `${time} · ${passRate.toFixed(1)}% pass`;
  }
}

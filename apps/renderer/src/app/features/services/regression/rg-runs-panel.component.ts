import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked, type AnimationCallbackEvent } from '@angular/core';
import {
  escapeHtml,
  fileSlug,
  formatDurationMs as formatDuration,
  regressionRunPassRate,
  type RegressionFlowTimelineEntry,
  type RegressionMetricsSample,
  type RegressionRunEntry,
  type RegressionRunRecord,
} from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, TxHintComponent, TxSelectComponent } from '@testrix/ui';

import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import { ganttTimelineExtentMs } from './rg-gantt-geometry';
import { RgDurationBarsComponent } from './rg-duration-bars.component';
import { RgGanttChartComponent } from './rg-gantt-chart.component';
import { RgLineChartComponent } from './rg-line-chart.component';
import { RgRunTimelineComponent } from './rg-run-timeline.component';
import { RgStatCardComponent } from './rg-stat-card.component';

export type RgResultsView = 'live' | 'history' | 'compare';

const RG_VIEWS: readonly RgResultsView[] = ['live', 'history', 'compare'];

interface CompareDelta {
  readonly label: string;
  readonly aValue: string;
  readonly bValue: string;
  readonly delta: string;
  readonly direction: 'better' | 'worse' | 'same';
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: 'tx-rg-runs-panel',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxSelectComponent,
    RgDurationBarsComponent,
    RgGanttChartComponent,
    RgLineChartComponent,
    RgRunTimelineComponent,
    RgStatCardComponent,
  ],
  templateUrl: './rg-runs-panel.component.html',
  styleUrl: './rg-runs-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgRunsPanelComponent {
  readonly runs = input<readonly RegressionRunRecord[]>([]);
  readonly goldenRunId = input<string | null>(null);
  readonly running = input(false);
  readonly progress = input<{ readonly total: number; readonly completed: number }>({
    total: 0,
    completed: 0,
  });
  readonly artifactName = input('Regression');

  /** Live suite telemetry, streamed from the host while a run is in flight. */
  readonly liveMetrics = input<RegressionMetricsSample | null>(null);
  readonly liveSamples = input<readonly RegressionMetricsSample[]>([]);
  readonly liveTimeline = input<readonly RegressionFlowTimelineEntry[]>([]);
  readonly liveEntries = input<readonly RegressionRunEntry[]>([]);

  readonly promoteGolden = output<string>();
  readonly clearHistory = output<void>();
  readonly rerunFailed = output<void>();
  readonly rerun = output<void>();
  readonly hide = output<void>();
  readonly resizeStart = output<PointerEvent>();

  readonly resultsView = signal<RgResultsView>('live');
  readonly viewSlideDir = signal<'left' | 'right' | null>(null);
  readonly selectedRunId = signal<string | null>(null);
  readonly compareSelection = signal<{ readonly a: string; readonly b: string } | null>(null);
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly selectedFlowId = signal<string | null>(null);
  readonly exportFeedback = signal('');

  constructor() {
    // Jump to the Live view and expand telemetry sections whenever a run starts.
    effect(() => {
      if (!this.running())
        return;
      untracked(() => {
        this.viewSlideDir.set(null);
        this.resultsView.set('live');
        this.selectedFlowId.set(null);
        this.collapsed.update((set) => {
          const next = new Set(set);
          next.delete('charts');
          next.delete('live');
          next.delete('timeline');
          return next;
        });
      });
    });
  }

  readonly selectedRun = computed(() => {
    const runs = this.runs();
    const id = this.selectedRunId() ?? runs[0]?.id ?? null;
    return runs.find((run) => run.id === id) ?? runs[0] ?? null;
  });

  readonly goldenRun = computed(() => {
    const id = this.goldenRunId();
    if (!id)
      return null;
    return this.runs().find((run) => run.id === id) ?? null;
  });

  readonly canCompare = computed(() => this.runs().length >= 2);

  readonly canRerunFailed = computed(() => {
    const run = this.runs()[0];
    return !!run && run.failed > 0 && !this.running();
  });

  readonly displayRun = computed(() => {
    if (this.resultsView() === 'compare')
      return this.compareRuns()?.b ?? this.selectedRun();
    return this.selectedRun();
  });

  readonly statusLabel = computed(() => {
    if (this.running())
      return 'Running';
    const run = this.displayRun();
    return run?.status ?? 'Idle';
  });

  readonly isLiveRunning = computed(() => this.resultsView() === 'live' && this.running());

  readonly showRunDetail = computed(() => {
    if (this.resultsView() === 'compare')
      return false;
    if (this.isLiveRunning())
      return false;
    return !!this.displayRun();
  });

  readonly runOptions = computed((): readonly SelectOption[] =>
    this.runs().map((run) => ({
      value: run.id,
      label: `${formatWhen(run.at)} · ${(regressionRunPassRate(run) * 100).toFixed(0)}%`,
    })),
  );

  // --- Live telemetry ---------------------------------------------------------

  readonly liveStats = computed(() => {
    const metrics = this.liveMetrics();
    const progress = this.progress();
    const decided = (metrics?.passedFlows ?? 0) + (metrics?.failedFlows ?? 0);
    return {
      passRate: `${(metrics?.passRatePercent ?? 0).toFixed(0)}%`,
      passed: metrics?.passedFlows ?? 0,
      failed: metrics?.failedFlows ?? 0,
      skipped: metrics?.skippedFlows ?? 0,
      parallelism: metrics?.activeParallelism ?? 0,
      elapsed: formatElapsed(metrics?.elapsedSec ?? 0),
      completed: metrics?.completedFlows ?? progress.completed,
      total: progress.total,
      decided,
    };
  });

  readonly livePassRateSeries = computed(() => this.liveSamples().map((sample) => sample.passRatePercent));
  readonly liveAvgDurationSeries = computed(() => this.liveSamples().map((sample) => sample.avgFlowDurationMs));
  readonly liveParallelismSeries = computed(() => this.liveSamples().map((sample) => sample.activeParallelism));

  readonly liveGanttTotalMs = computed(() => {
    const fromMetrics = (this.liveMetrics()?.elapsedSec ?? 0) * 1000;
    const fromTimeline = ganttTimelineExtentMs(this.liveTimeline(), fromMetrics);
    return Math.max(fromMetrics, fromTimeline, 1);
  });

  readonly hasLiveSamples = computed(() => this.liveSamples().length >= 2);

  // --- History ----------------------------------------------------------------

  readonly historyPassRateSeries = computed(() =>
    [...this.runs()].reverse().map((run) => regressionRunPassRate(run) * 100),
  );

  readonly historyDurationSeries = computed(() =>
    [...this.runs()].reverse().map((run) => run.durationMs),
  );

  readonly historyP95Series = computed(() =>
    [...this.runs()].reverse().map((run) => run.p95DurationMs ?? 0),
  );

  readonly hasP95History = computed(() => this.historyP95Series().some((value) => value > 0));

  readonly historyPointIds = computed(() => [...this.runs()].reverse().map((run) => run.id));

  readonly selectedGanttTimeline = computed(() => this.displayRun()?.flowTimeline ?? []);
  readonly selectedGanttTotalMs = computed(() => {
    const run = this.displayRun();
    if (!run)
      return 1;
    return Math.max(run.durationMs, ganttTimelineExtentMs(run.flowTimeline, run.durationMs), 1);
  });

  readonly selectedPassRateSamples = computed(() =>
    (this.displayRun()?.samples ?? []).map((sample) => sample.passRatePercent),
  );
  readonly selectedAvgDurationSamples = computed(() =>
    (this.displayRun()?.samples ?? []).map((sample) => sample.avgFlowDurationMs),
  );
  readonly hasSelectedSamples = computed(() => (this.displayRun()?.samples.length ?? 0) >= 2);

  readonly hasSelectedTimeline = computed(() => this.selectedGanttTimeline().length > 0);

  // --- Compare ----------------------------------------------------------------

  readonly compareRuns = computed(() => {
    const selection = this.compareSelection();
    if (!selection)
      return null;
    const a = this.runs().find((run) => run.id === selection.a) ?? null;
    const b = this.runs().find((run) => run.id === selection.b) ?? null;
    if (!a || !b)
      return null;
    return { a, b };
  });

  readonly compareGanttTimeline = computed(() => this.compareRuns()?.b.flowTimeline ?? []);
  readonly compareGhostTimeline = computed(() => this.compareRuns()?.a.flowTimeline ?? []);
  readonly compareGanttTotalMs = computed(() => {
    const pair = this.compareRuns();
    if (!pair)
      return 1;
    return Math.max(
      pair.a.durationMs,
      pair.b.durationMs,
      ganttTimelineExtentMs(pair.a.flowTimeline, pair.a.durationMs),
      ganttTimelineExtentMs(pair.b.flowTimeline, pair.b.durationMs),
      1,
    );
  });

  readonly compareDeltas = computed((): readonly CompareDelta[] => {
    const pair = this.compareRuns();
    if (!pair)
      return [];
    return this.compareDeltasFor(pair.a, pair.b);
  });

  readonly baselineDeltas = computed((): readonly CompareDelta[] => {
    const run = this.displayRun();
    const golden = this.goldenRun();
    if (!run || !golden || run.id === golden.id)
      return [];
    return this.compareDeltasFor(golden, run);
  });

  readonly entryDiffRows = computed(() => {
    const pair = this.compareRuns();
    if (!pair)
      return [] as readonly {
        key: string;
        label: string;
        aStatus: string;
        bStatus: string;
        changed: boolean;
      }[];
    const map = new Map<string, { label: string; a?: RegressionRunEntry; b?: RegressionRunEntry }>();
    for (const entry of pair.a.entries) {
      const key = `${entry.flowId}::${entry.scenarioId}`;
      map.set(key, { label: `${entry.flowName} · ${entry.scenarioName}`, a: entry });
    }
    for (const entry of pair.b.entries) {
      const key = `${entry.flowId}::${entry.scenarioId}`;
      const existing = map.get(key) ?? { label: `${entry.flowName} · ${entry.scenarioName}` };
      map.set(key, { ...existing, b: entry });
    }
    return [...map.entries()].map(([key, row]) => ({
      key,
      label: row.label,
      aStatus: row.a?.status ?? '—',
      bStatus: row.b?.status ?? '—',
      changed: (row.a?.status ?? '—') !== (row.b?.status ?? '—'),
    }));
  });

  handleViewChange(view: RgResultsView): void {
    if (view === this.resultsView())
      return;
    if (view === 'compare' && !this.canCompare())
      return;
    const from = RG_VIEWS.indexOf(this.resultsView());
    const to = RG_VIEWS.indexOf(view);
    this.viewSlideDir.set(to >= from ? 'right' : 'left');
    this.resultsView.set(view);
    if (view === 'compare' && !this.compareSelection() && this.runs().length >= 2) {
      this.compareSelection.set({ a: this.runs()[1]!.id, b: this.runs()[0]!.id });
    }
  }

  handleViewEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.viewSlideDir());
  }

  handleViewLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.viewSlideDir());
  }

  handleSelectedRunChange(id: string): void {
    this.selectedRunId.set(id);
    this.selectedFlowId.set(null);
    if (this.resultsView() === 'live')
      this.handleViewChange('history');
  }

  handleCompareSelection(selection: { readonly a: string; readonly b: string }): void {
    this.compareSelection.set(selection);
    this.handleViewChange('compare');
  }

  handlePinRun(id: string): void {
    this.promoteGolden.emit(id);
  }

  handleFlowSelected(flowId: string): void {
    this.selectedFlowId.set(this.selectedFlowId() === flowId ? null : flowId);
  }

  handleCompareRunA(id: string): void {
    const current = this.compareSelection();
    const b = current?.b ?? this.runs()[0]?.id;
    if (b && id !== b)
      this.compareSelection.set({ a: id, b });
  }

  handleCompareRunB(id: string): void {
    const current = this.compareSelection();
    const a = current?.a ?? this.runs()[1]?.id ?? this.runs()[0]?.id;
    if (a && id !== a)
      this.compareSelection.set({ a, b: id });
  }

  handleSwapCompare(): void {
    const current = this.compareSelection();
    if (!current)
      return;
    this.compareSelection.set({ a: current.b, b: current.a });
  }

  handleToggleSection(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id))
      next.delete(id);
    else
      next.add(id);
    this.collapsed.set(next);
  }

  isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  exportJson(): void {
    const run = this.displayRun();
    if (!run)
      return;
    this.download(
      `${fileSlug(this.artifactName(), 'regression')}-${run.id}.json`,
      JSON.stringify({ artifact: this.artifactName(), run }, null, 2),
      'application/json',
    );
    this.showFeedback('JSON downloaded');
  }

  exportReport(): void {
    const run = this.displayRun();
    if (!run)
      return;
    void copyText(buildRunReport(this.artifactName(), run))
      .then(() => this.showFeedback('Report copied'))
      .catch(() => this.showFeedback('Copy failed'));
  }

  exportHtml(): void {
    const run = this.displayRun();
    if (!run)
      return;
    this.download(
      `${fileSlug(this.artifactName(), 'regression')}-${run.id}.html`,
      buildRunHtml(this.artifactName(), run, this.compareRuns()?.a ?? null),
      'text/html',
    );
    this.showFeedback('HTML downloaded');
  }

  formatDuration = formatDuration;
  formatWhen = formatWhen;
  passRate = (run: RegressionRunRecord) => `${(regressionRunPassRate(run) * 100).toFixed(1)}%`;

  private showFeedback(message: string): void {
    this.exportFeedback.set(message);
    window.setTimeout(() => {
      if (this.exportFeedback() === message)
        this.exportFeedback.set('');
    }, 2000);
  }

  private download(name: string, contents: string, mime: string): void {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private compareDeltasFor(a: RegressionRunRecord, b: RegressionRunRecord): CompareDelta[] {
    const aPass = regressionRunPassRate(a) * 100;
    const bPass = regressionRunPassRate(b) * 100;
    const passDelta = bPass - aPass;
    const durDelta = b.durationMs - a.durationMs;
    const deltas: CompareDelta[] = [
      {
        label: 'Pass rate',
        aValue: `${aPass.toFixed(1)}%`,
        bValue: `${bPass.toFixed(1)}%`,
        delta: `${passDelta > 0 ? '+' : ''}${passDelta.toFixed(1)}pp`,
        direction: passDelta > 0.05 ? 'better' : passDelta < -0.05 ? 'worse' : 'same',
      },
      {
        label: 'Duration',
        aValue: formatDuration(a.durationMs),
        bValue: formatDuration(b.durationMs),
        delta: `${durDelta > 0 ? '+' : ''}${formatDuration(Math.abs(durDelta))}`,
        direction: durDelta < 0 ? 'better' : durDelta > 0 ? 'worse' : 'same',
      },
      {
        label: 'Failed',
        aValue: `${a.failed}`,
        bValue: `${b.failed}`,
        delta: `${b.failed - a.failed > 0 ? '+' : ''}${b.failed - a.failed}`,
        direction: b.failed < a.failed ? 'better' : b.failed > a.failed ? 'worse' : 'same',
      },
    ];
    if (a.p95DurationMs !== undefined && b.p95DurationMs !== undefined) {
      const p95Delta = b.p95DurationMs - a.p95DurationMs;
      deltas.push({
        label: 'p95 entry',
        aValue: formatDuration(a.p95DurationMs),
        bValue: formatDuration(b.p95DurationMs),
        delta: `${p95Delta > 0 ? '+' : ''}${formatDuration(Math.abs(p95Delta))}`,
        direction: p95Delta < 0 ? 'better' : p95Delta > 0 ? 'worse' : 'same',
      });
    }
    return deltas;
  }
}

function formatElapsed(sec: number): string {
  if (sec < 60)
    return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${min}m ${rem}s`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(value);
  return Promise.reject(new Error('Clipboard unavailable'));
}

function buildRunReport(name: string, run: RegressionRunRecord): string {
  const lines: string[] = [
    `Regression: ${name}`,
    `Run: ${run.id}`,
    `When: ${formatWhen(run.at)}`,
    `Status: ${run.status}`,
    `Pass rate: ${(regressionRunPassRate(run) * 100).toFixed(1)}%`,
    `Passed ${run.passed} · Failed ${run.failed} · Skipped ${run.skipped}`,
    `Duration: ${formatDuration(run.durationMs)}`,
  ];
  if (run.avgDurationMs !== undefined)
    lines.push(`Avg entry: ${formatDuration(run.avgDurationMs)}`);
  if (run.p95DurationMs !== undefined)
    lines.push(`p95 entry: ${formatDuration(run.p95DurationMs)}`);
  lines.push('', 'Entries:');
  for (const entry of run.entries) {
    lines.push(
      `  [${entry.status}] ${entry.flowName} · ${entry.scenarioName} — ${formatDuration(entry.durationMs)}${
        entry.error ? ` (${entry.error})` : ''
      }`,
    );
  }
  return lines.join('\n');
}

function buildRunHtml(
  name: string,
  run: RegressionRunRecord,
  compare: RegressionRunRecord | null,
): string {
  const rows = run.entries
    .map(
      (entry) =>
        `<tr class="s-${entry.status}"><td>${escapeHtml(entry.flowName)}</td><td>${escapeHtml(
          entry.scenarioName,
        )}</td><td>${entry.status}</td><td>${formatDuration(entry.durationMs)}</td><td>${escapeHtml(
          entry.error ?? '—',
        )}</td></tr>`,
    )
    .join('');
  const compareLine = compare
    ? `<p>Compared with ${escapeHtml(compare.id)} (${(regressionRunPassRate(compare) * 100).toFixed(1)}% pass)</p>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    name,
  )} — regression run</title><style>
    body{font-family:system-ui,sans-serif;margin:24px;color:#1c1820;background:#fff}
    h1{font-size:20px} table{border-collapse:collapse;width:100%;font-size:13px;margin-top:12px}
    th,td{border-bottom:1px solid #ddd;padding:6px 10px;text-align:left}
    tr.s-error td,tr.s-cancelled td{color:#c0334a} tr.s-ok td{color:#1a8f5a}
    .meta{color:#555;font-size:13px}
  </style></head><body>
    <h1>${escapeHtml(name)}</h1>
    <p class="meta">${formatWhen(run.at)} · ${run.status} · ${(regressionRunPassRate(run) * 100).toFixed(
      1,
    )}% pass · ${formatDuration(run.durationMs)}</p>
    <p class="meta">Passed ${run.passed} · Failed ${run.failed} · Skipped ${run.skipped}${
      run.p95DurationMs !== undefined ? ` · p95 ${formatDuration(run.p95DurationMs)}` : ''
    }</p>
    ${compareLine}
    <table><thead><tr><th>Flow</th><th>Scenario</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`;
}

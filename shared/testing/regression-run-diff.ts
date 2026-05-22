import type { RegressionRun, RegressionRunSummary } from './regression-run.schema';

export type RegressionMetricDeltaDirection = 'better' | 'worse' | 'neutral';

export interface RegressionMetricDelta {
  readonly label: string;
  readonly aValue: string;
  readonly bValue: string;
  readonly delta: string;
  readonly direction: RegressionMetricDeltaDirection;
}

export interface RegressionRunCompareResult {
  readonly runA: RegressionRun;
  readonly runB: RegressionRun;
  readonly metrics: readonly RegressionMetricDelta[];
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

function deltaDirection(delta: number, higherIsBetter: boolean): RegressionMetricDeltaDirection {
  if (Math.abs(delta) < 0.001) {
    return 'neutral';
  }
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'better' : 'worse';
}

function compareNumberMetric(
  label: string,
  a: number,
  b: number,
  format: (value: number) => string,
  higherIsBetter: boolean,
): RegressionMetricDelta {
  const delta = b - a;
  const sign = delta > 0 ? '+' : '';
  return {
    label,
    aValue: format(a),
    bValue: format(b),
    delta: `${sign}${format(Math.abs(delta))}`,
    direction: deltaDirection(delta, higherIsBetter),
  };
}

/** Compares two run summaries; B is treated as the newer run. */
export function compareRegressionRunSummaries(
  a: RegressionRunSummary,
  b: RegressionRunSummary,
): RegressionMetricDelta[] {
  return [
    compareNumberMetric('Pass rate', a.passRatePercent, b.passRatePercent, formatPercent, true),
    compareNumberMetric(
      'Acceptance margin',
      a.acceptanceMarginPercent,
      b.acceptanceMarginPercent,
      formatPercent,
      true,
    ),
    compareNumberMetric('Total duration', a.totalDurationMs, b.totalDurationMs, formatMs, false),
    compareNumberMetric('Avg flow duration', a.avgFlowDurationMs, b.avgFlowDurationMs, formatMs, false),
    compareNumberMetric('P95 flow duration', a.p95FlowDurationMs, b.p95FlowDurationMs, formatMs, false),
    compareNumberMetric('Failed steps', a.failedSteps, b.failedSteps, (v) => String(v), false),
    compareNumberMetric('Peak parallelism', a.peakParallelism, b.peakParallelism, (v) => String(v), false),
  ];
}

/** Compares two persisted regression run records. */
export function compareRegressionRuns(a: RegressionRun, b: RegressionRun): RegressionRunCompareResult {
  const summaryA = a.summary ?? emptySummary();
  const summaryB = b.summary ?? emptySummary();
  return {
    runA: a,
    runB: b,
    metrics: compareRegressionRunSummaries(summaryA, summaryB),
  };
}

function emptySummary(): RegressionRunSummary {
  return {
    totalDurationMs: 0,
    passRatePercent: 0,
    acceptancePercent: 100,
    meetsAcceptance: false,
    acceptanceMarginPercent: -100,
    avgFlowDurationMs: 0,
    p50FlowDurationMs: 0,
    p95FlowDurationMs: 0,
    peakParallelism: 0,
    totalSteps: 0,
    passedSteps: 0,
    failedSteps: 0,
    skippedSteps: 0,
  };
}

/** Builds a Markdown diff report for two runs. */
export function buildRegressionDiffReport(a: RegressionRun, b: RegressionRun): string {
  const compare = compareRegressionRuns(a, b);
  const lines = [
    `# Regression diff`,
    ``,
    `Run A: ${a.startedAt}`,
    `Run B: ${b.startedAt}`,
    ``,
    `## Summary deltas`,
    ...compare.metrics.map((m) => `- ${m.label}: ${m.aValue} → ${m.bValue} (${m.delta})`),
  ];
  return lines.join('\n');
}

/** Serializes a run record for export. */
export function serializeRegressionRunExport(record: RegressionRun): string {
  return JSON.stringify(record, null, 2);
}

/** Builds a plain-text report for a run record. */
export function buildRegressionRunReport(record: RegressionRun): string {
  const summary = record.summary;
  const lines = [
    `Regression run: ${record.id}`,
    `Status: ${record.status}`,
    `Started: ${record.startedAt}`,
    record.finishedAt ? `Finished: ${record.finishedAt}` : '',
    '',
  ].filter(Boolean);

  if (summary) {
    lines.push(
      'Summary',
      `- Pass rate: ${summary.passRatePercent.toFixed(1)}% (acceptance ≥ ${summary.acceptancePercent}%)`,
      `- Meets acceptance: ${summary.meetsAcceptance ? 'yes' : 'no'}`,
      `- Duration: ${summary.totalDurationMs} ms`,
      `- Flows: ${record.passedCount} passed, ${record.failedCount} failed, ${record.skippedCount} skipped`,
    );
  }

  if (record.thresholdResults.length > 0) {
    lines.push('', 'Thresholds');
    for (const result of record.thresholdResults) {
      lines.push(`- ${result.label}: ${result.pass ? 'PASS' : 'FAIL'} (${result.actual} vs ${result.expected})`);
    }
  }

  return lines.join('\n');
}

import type {
  RegressionFlowResult,
  RegressionMetricsSample,
  RegressionRunMetrics,
  RegressionThresholds,
} from './regression-run.schema';
import type { RegressionRun } from './regression-run.schema';

/** Computes percentile from sorted numeric array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

/** Computes pass rate from attempted flow counts. */
export function computeRegressionPassRatePercent(passed: number, failed: number): number {
  const attempted = passed + failed;
  if (attempted <= 0) {
    return 0;
  }
  return (passed / attempted) * 100;
}

/** Builds a live metrics sample from runner counters. */
export function buildRegressionMetricsSample(
  elapsedSec: number,
  passed: number,
  failed: number,
  skipped: number,
  activeParallelism: number,
  flowDurationsMs: readonly number[],
): RegressionMetricsSample {
  const completed = passed + failed;
  const avg =
    flowDurationsMs.length > 0
      ? flowDurationsMs.reduce((a, b) => a + b, 0) / flowDurationsMs.length
      : 0;

  return {
    elapsedSec,
    completedFlows: completed,
    passedFlows: passed,
    failedFlows: failed,
    skippedFlows: skipped,
    activeParallelism,
    passRatePercent: computeRegressionPassRatePercent(passed, failed),
    avgFlowDurationMs: avg,
  };
}

/** Updates live regression metrics snapshot. */
export function updateRegressionRunMetrics(
  current: RegressionRunMetrics,
  patch: Partial<RegressionRunMetrics>,
): RegressionRunMetrics {
  return {
    ...current,
    ...patch,
    samples: patch.samples ?? current.samples,
  };
}

/** Appends a sample capped at maxSamples. */
export function appendRegressionMetricsSample(
  samples: readonly RegressionMetricsSample[],
  sample: RegressionMetricsSample,
  maxSamples: number,
): RegressionMetricsSample[] {
  const next = [...samples, sample];
  if (next.length <= maxSamples) {
    return next;
  }
  return next.slice(next.length - maxSamples);
}

/** Computes flow duration percentiles from results. */
export function computeFlowDurationPercentiles(
  flowResults: readonly RegressionFlowResult[],
): { readonly p50: number; readonly p95: number; readonly avg: number } {
  const durations = flowResults
    .filter((r) => r.status === 'passed' || r.status === 'failed')
    .map((r) => r.durationMs)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return { p50: 0, p95: 0, avg: 0 };
  }

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    avg,
  };
}

/** Returns minimum flows required to meet acceptance percent. */
export function requiredPassedFlows(totalFlows: number, acceptancePercent: number): number {
  if (totalFlows <= 0) {
    return 0;
  }
  return Math.ceil((totalFlows * acceptancePercent) / 100);
}

/** Whether current pass counts meet acceptance threshold. */
export function meetsAcceptanceThreshold(
  passed: number,
  failed: number,
  acceptancePercent: number,
): boolean {
  return computeRegressionPassRatePercent(passed, failed) >= acceptancePercent;
}

/** Counts aggregate step outcomes from flow results. */
export function aggregateStepCounts(flowResults: readonly RegressionFlowResult[]): {
  readonly totalSteps: number;
  readonly passedSteps: number;
  readonly failedSteps: number;
  readonly skippedSteps: number;
} {
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;

  for (const result of flowResults) {
    passedSteps += result.passedStepCount;
    failedSteps += result.failedStepCount;
    skippedSteps += result.skippedStepCount;
  }

  return {
    totalSteps: passedSteps + failedSteps + skippedSteps,
    passedSteps,
    failedSteps,
    skippedSteps,
  };
}

/** Peak worker slots used during a run timeline. */
export function peakParallelismFromTimeline(
  timeline: readonly { readonly workerSlot: number }[],
): number {
  if (timeline.length === 0) {
    return 0;
  }
  return Math.max(...timeline.map((e) => e.workerSlot)) + 1;
}

export function evaluateRegressionThresholds(
  passed: number,
  failed: number,
  totalDurationMs: number,
  p95FlowDurationMs: number,
  thresholds: RegressionThresholds,
): { readonly pass: boolean; readonly results: readonly { label: string; pass: boolean; expected: string; actual: string }[] } {
  const passRate = computeRegressionPassRatePercent(passed, failed);
  const results: { label: string; pass: boolean; expected: string; actual: string }[] = [];

  results.push({
    label: 'Acceptance rate',
    pass: passRate >= thresholds.acceptancePercent,
    expected: `≥ ${thresholds.acceptancePercent}%`,
    actual: `${passRate.toFixed(1)}% (${passed}/${passed + failed} passed)`,
  });

  if (thresholds.maxFailedFlows !== undefined) {
    results.push({
      label: 'Max failed flows',
      pass: failed <= thresholds.maxFailedFlows,
      expected: `≤ ${thresholds.maxFailedFlows}`,
      actual: String(failed),
    });
  }

  if (thresholds.maxTotalDurationMs !== undefined) {
    results.push({
      label: 'Max total duration',
      pass: totalDurationMs <= thresholds.maxTotalDurationMs,
      expected: `≤ ${thresholds.maxTotalDurationMs} ms`,
      actual: `${totalDurationMs} ms`,
    });
  }

  if (thresholds.maxP95FlowDurationMs !== undefined) {
    results.push({
      label: 'Max p95 flow duration',
      pass: p95FlowDurationMs <= thresholds.maxP95FlowDurationMs,
      expected: `≤ ${thresholds.maxP95FlowDurationMs} ms`,
      actual: `${Math.round(p95FlowDurationMs)} ms`,
    });
  }

  return {
    pass: results.every((r) => r.pass),
    results,
  };
}

/** Builds run summary from finalized flow results. */
export function buildRegressionRunSummary(
  flowResults: readonly RegressionFlowResult[],
  totalDurationMs: number,
  acceptancePercent: number,
  timeline: readonly { readonly workerSlot: number }[],
): RegressionRun['summary'] {
  const passed = flowResults.filter((r) => r.status === 'passed').length;
  const failed = flowResults.filter((r) => r.status === 'failed').length;
  const passRatePercent = computeRegressionPassRatePercent(passed, failed);
  const { p50, p95, avg } = computeFlowDurationPercentiles(flowResults);
  const steps = aggregateStepCounts(flowResults);
  const meetsAcceptance = passRatePercent >= acceptancePercent;

  return {
    totalDurationMs,
    passRatePercent,
    acceptancePercent,
    meetsAcceptance,
    acceptanceMarginPercent: passRatePercent - acceptancePercent,
    avgFlowDurationMs: avg,
    p50FlowDurationMs: p50,
    p95FlowDurationMs: p95,
    peakParallelism: peakParallelismFromTimeline(timeline),
    ...steps,
  };
}

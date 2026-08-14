import type { LoadTestRunMetrics } from './load-test-run.schema';
import {
  LOAD_TEST_RUN_SAMPLES_MAX,
  loadTestRunRecordSchema,
  loadTestRunSummarySchema,
  type LoadTestProfile,
  type LoadTestRunRecord,
  type LoadTestRunStatus,
  type LoadTestThresholdResult,
  type LoadTestThresholds,
} from './load-tests.schema';

export interface CreateLoadTestRunRecordInput {
  readonly id: string;
  readonly metrics: LoadTestRunMetrics;
  readonly profile: LoadTestProfile;
  readonly thresholds: LoadTestThresholds;
  readonly startedAt: string;
  readonly status: LoadTestRunStatus;
  readonly finishedAt?: string;
}

/** Builds threshold pass/fail rows for a completed run. */
export function buildThresholdResults(
  metrics: LoadTestRunMetrics,
  thresholds: LoadTestThresholds,
): LoadTestThresholdResult[] {
  const results: LoadTestThresholdResult[] = [];

  if (thresholds.maxErrorRatePercent !== undefined) {
    results.push({
      label: 'Max error rate',
      pass: metrics.errorRatePercent <= thresholds.maxErrorRatePercent,
      expected: `≤ ${thresholds.maxErrorRatePercent}%`,
      actual: `${metrics.errorRatePercent.toFixed(2)}%`,
    });
  }

  if (thresholds.minSuccessRatePercent !== undefined) {
    results.push({
      label: 'Min success rate',
      pass: metrics.successRatePercent >= thresholds.minSuccessRatePercent,
      expected: `≥ ${thresholds.minSuccessRatePercent}%`,
      actual: `${metrics.successRatePercent.toFixed(2)}%`,
    });
  }

  if (thresholds.maxP95LatencyMs !== undefined) {
    results.push({
      label: 'Max p95 latency',
      pass: metrics.latencyMs.p95 <= thresholds.maxP95LatencyMs,
      expected: `≤ ${thresholds.maxP95LatencyMs} ms`,
      actual: `${metrics.latencyMs.p95} ms`,
    });
  }

  if (thresholds.minRequestsPerSec !== undefined) {
    results.push({
      label: 'Min throughput',
      pass: metrics.requestsPerSec >= thresholds.minRequestsPerSec,
      expected: `≥ ${thresholds.minRequestsPerSec} rps`,
      actual: `${metrics.requestsPerSec.toFixed(1)} rps`,
    });
  }

  return results;
}

/** Determines pass/fail outcome from configured thresholds. */
export function evaluateLoadTestRunStatus(
  metrics: LoadTestRunMetrics,
  thresholds: LoadTestThresholds,
): 'passed' | 'failed' {
  const results = buildThresholdResults(metrics, thresholds);
  if (results.length === 0) {
    return metrics.errorRatePercent <= 5 ? 'passed' : 'failed';
  }
  return results.every((result) => result.pass) ? 'passed' : 'failed';
}

/** Trims samples to the configured maximum for storage. */
export function trimLoadTestRunSamples(
  samples: readonly LoadTestRunMetrics['samples'][number][],
): LoadTestRunMetrics['samples'] {
  if (samples.length <= LOAD_TEST_RUN_SAMPLES_MAX) {
    return [...samples];
  }
  return samples.slice(samples.length - LOAD_TEST_RUN_SAMPLES_MAX);
}

/** Builds a persisted run record from live metrics. */
export function createLoadTestRunRecord(input: CreateLoadTestRunRecordInput): LoadTestRunRecord {
  const { metrics, profile, thresholds, startedAt, status, id, finishedAt } = input;
  const thresholdResults = buildThresholdResults(metrics, thresholds);
  const resolvedStatus: LoadTestRunStatus =
    status === 'cancelled' ? 'cancelled' : evaluateLoadTestRunStatus(metrics, thresholds);

  const summary = loadTestRunSummarySchema.parse({
    successRatePercent: metrics.successRatePercent,
    errorRatePercent: metrics.errorRatePercent,
    requestsPerSec: metrics.requestsPerSec,
    peakRequestsPerSec: metrics.peakRequestsPerSec,
    totalRequests: metrics.totalRequests,
    failedRequests: metrics.failedRequests,
    latencyMs: metrics.latencyMs,
    elapsedSec: metrics.elapsedSec,
    virtualUsers: metrics.virtualUsers,
  });

  return loadTestRunRecordSchema.parse({
    id,
    startedAt,
    finishedAt: finishedAt ?? new Date().toISOString(),
    status: resolvedStatus,
    profileSnapshot: profile,
    thresholdsSnapshot: thresholds,
    summary,
    samples: trimLoadTestRunSamples(metrics.samples),
    thresholdResults,
  });
}

/** Prepends a run and trims history to the configured maximum. */
export function prependLoadTestRun(
  runs: readonly LoadTestRunRecord[],
  record: LoadTestRunRecord,
  max = 30,
): LoadTestRunRecord[] {
  return [record, ...runs].slice(0, max);
}

/** Converts a persisted run record into live metrics for dashboard display. */
export function metricsFromRunRecord(record: LoadTestRunRecord): LoadTestRunMetrics {
  const { summary, samples } = record;
  return {
    running: false,
    elapsedSec: summary.elapsedSec,
    virtualUsers: summary.virtualUsers,
    totalRequests: summary.totalRequests,
    failedRequests: summary.failedRequests,
    successRatePercent: summary.successRatePercent,
    requestsPerSec: summary.requestsPerSec,
    peakRequestsPerSec: summary.peakRequestsPerSec,
    errorRatePercent: summary.errorRatePercent,
    latencyMs: summary.latencyMs,
    samples: [...samples],
  };
}

import type { LoadHealthMetrics, LoadMetrics, LoadMetricSample, LoadRunRecord } from '@testrix/contracts';

/**
 * Unified display metrics for the results dashboard.
 *
 * Both live {@link LoadMetrics} and persisted {@link LoadRunRecord} values map
 * into this shape so the dashboard renders from a single source. It is a
 * superset of {@link LoadHealthMetrics}, so it can be passed to health helpers
 * directly.
 */
export interface LtDisplayMetrics extends LoadHealthMetrics {
  readonly running: boolean;
  readonly elapsedSec: number;
  readonly requests: number;
  readonly errors: number;
}

/** Returns zeroed display metrics for an empty dashboard. */
export function emptyLtDisplayMetrics(): LtDisplayMetrics {
  return {
    running: false,
    elapsedSec: 0,
    virtualUsers: 0,
    requests: 0,
    errors: 0,
    rps: 0,
    peakRps: 0,
    avgMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    successRatePercent: 100,
    errorRatePercent: 0,
    samples: [],
  };
}

/** Maps live metrics from the host into display metrics. */
export function metricsFromLive(metrics: LoadMetrics): LtDisplayMetrics {
  return {
    running: metrics.running,
    elapsedSec: metrics.elapsedMs / 1000,
    virtualUsers: metrics.virtualUsers,
    requests: metrics.requests,
    errors: metrics.errors,
    rps: metrics.rps,
    peakRps: metrics.peakRps,
    avgMs: metrics.avgMs,
    p50Ms: metrics.p50Ms,
    p95Ms: metrics.p95Ms,
    p99Ms: metrics.p99Ms,
    successRatePercent: metrics.successRatePercent,
    errorRatePercent: metrics.errorRatePercent,
    samples: metrics.samples,
  };
}

/** Maps a persisted run record into display metrics, filling missing rates. */
export function metricsFromRunRecord(run: LoadRunRecord): LtDisplayMetrics {
  const requests = Math.max(0, run.requests);
  const errors = Math.max(0, run.errors);
  const errorRatePercent =
    run.errorRatePercent ?? (requests === 0 ? 0 : (errors / requests) * 100);
  const successRatePercent =
    run.successRatePercent ?? (requests === 0 ? 100 : ((requests - errors) / requests) * 100);
  return {
    running: false,
    elapsedSec: run.durationMs / 1000,
    virtualUsers: run.virtualUsers,
    requests,
    errors,
    rps: run.rps,
    peakRps: run.peakRps ?? run.rps,
    avgMs: run.avgMs ?? 0,
    p50Ms: run.p50Ms,
    p95Ms: run.p95Ms,
    p99Ms: run.p99Ms,
    successRatePercent,
    errorRatePercent,
    samples: run.samples,
  };
}

/** Elapsed seconds for a sample, deriving from milliseconds when absent. */
export function sampleElapsedSec(sample: LoadMetricSample): number {
  return sample.elapsedSec ?? sample.elapsedMs / 1000;
}

/** Rolling error rate for a sample, computing from counts when absent. */
export function sampleErrorRatePercent(sample: LoadMetricSample): number {
  if (typeof sample.errorRatePercent === 'number')
    return sample.errorRatePercent;
  return sample.requests === 0 ? 0 : (sample.errors / sample.requests) * 100;
}

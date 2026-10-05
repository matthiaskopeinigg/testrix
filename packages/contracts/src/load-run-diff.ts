import type { LoadRunRecord } from './load-file';

export type LoadMetricDeltaDirection = 'better' | 'worse' | 'neutral';

export interface LoadMetricDelta {
  readonly label: string;
  readonly aValue: string;
  readonly bValue: string;
  readonly delta: string;
  readonly direction: LoadMetricDeltaDirection;
}

/** Normalized run summary using derived 2.0 flat metric names. */
export interface LoadRunSummary {
  readonly successRatePercent: number;
  readonly errorRatePercent: number;
  readonly rps: number;
  readonly peakRps: number;
  readonly requests: number;
  readonly errors: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly virtualUsers: number;
}

export interface LoadRunCompareResult {
  readonly runA: LoadRunRecord;
  readonly runB: LoadRunRecord;
  readonly metrics: readonly LoadMetricDelta[];
}

/** Derives a normalized summary from a run record, filling missing rates. */
export function loadRunSummaryOf(run: LoadRunRecord): LoadRunSummary {
  const requests = Math.max(0, run.requests);
  const errors = Math.max(0, run.errors);
  const errorRatePercent =
    run.errorRatePercent ?? (requests === 0 ? 0 : (errors / requests) * 100);
  const successRatePercent =
    run.successRatePercent ?? (requests === 0 ? 100 : ((requests - errors) / requests) * 100);
  return {
    successRatePercent,
    errorRatePercent,
    rps: run.rps,
    peakRps: run.peakRps ?? run.rps,
    requests,
    errors,
    avgMs: run.avgMs ?? 0,
    p50Ms: run.p50Ms,
    p95Ms: run.p95Ms,
    p99Ms: run.p99Ms,
    virtualUsers: run.virtualUsers,
  };
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatRps(value: number): string {
  return `${value.toFixed(1)} rps`;
}

function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

function deltaDirection(delta: number, higherIsBetter: boolean): LoadMetricDeltaDirection {
  if (Math.abs(delta) < 0.001)
    return 'neutral';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'better' : 'worse';
}

function compareNumberMetric(
  label: string,
  a: number,
  b: number,
  format: (value: number) => string,
  higherIsBetter: boolean,
): LoadMetricDelta {
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
export function compareLoadRunSummaries(a: LoadRunSummary, b: LoadRunSummary): LoadMetricDelta[] {
  return [
    compareNumberMetric('Success rate', a.successRatePercent, b.successRatePercent, formatPercent, true),
    compareNumberMetric('Error rate', a.errorRatePercent, b.errorRatePercent, formatPercent, false),
    compareNumberMetric('Throughput', a.rps, b.rps, formatRps, true),
    compareNumberMetric('Peak throughput', a.peakRps, b.peakRps, formatRps, true),
    compareNumberMetric('p50 latency', a.p50Ms, b.p50Ms, formatMs, false),
    compareNumberMetric('p95 latency', a.p95Ms, b.p95Ms, formatMs, false),
    compareNumberMetric('p99 latency', a.p99Ms, b.p99Ms, formatMs, false),
    compareNumberMetric('Avg latency', a.avgMs, b.avgMs, formatMs, false),
    compareNumberMetric('Total requests', a.requests, b.requests, (v) => String(v), true),
    compareNumberMetric('Failed requests', a.errors, b.errors, (v) => String(v), false),
  ];
}

/** Compares two persisted run records. */
export function compareLoadRuns(a: LoadRunRecord, b: LoadRunRecord): LoadRunCompareResult {
  return {
    runA: a,
    runB: b,
    metrics: compareLoadRunSummaries(loadRunSummaryOf(a), loadRunSummaryOf(b)),
  };
}

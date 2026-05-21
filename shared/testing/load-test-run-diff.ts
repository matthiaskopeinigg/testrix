import type { LoadTestRunRecord, LoadTestRunSummary } from './load-tests.schema';

export type LoadTestMetricDeltaDirection = 'better' | 'worse' | 'neutral';

export interface LoadTestMetricDelta {
  readonly label: string;
  readonly aValue: string;
  readonly bValue: string;
  readonly delta: string;
  readonly direction: LoadTestMetricDeltaDirection;
}

export interface LoadTestRunCompareResult {
  readonly runA: LoadTestRunRecord;
  readonly runB: LoadTestRunRecord;
  readonly metrics: readonly LoadTestMetricDelta[];
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

function deltaDirection(
  delta: number,
  higherIsBetter: boolean,
): LoadTestMetricDeltaDirection {
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
): LoadTestMetricDelta {
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
export function compareLoadTestRunSummaries(
  a: LoadTestRunSummary,
  b: LoadTestRunSummary,
): LoadTestMetricDelta[] {
  return [
    compareNumberMetric('Success rate', a.successRatePercent, b.successRatePercent, formatPercent, true),
    compareNumberMetric('Error rate', a.errorRatePercent, b.errorRatePercent, formatPercent, false),
    compareNumberMetric('Throughput', a.requestsPerSec, b.requestsPerSec, formatRps, true),
    compareNumberMetric('Peak throughput', a.peakRequestsPerSec, b.peakRequestsPerSec, formatRps, true),
    compareNumberMetric('p50 latency', a.latencyMs.p50, b.latencyMs.p50, formatMs, false),
    compareNumberMetric('p95 latency', a.latencyMs.p95, b.latencyMs.p95, formatMs, false),
    compareNumberMetric('p99 latency', a.latencyMs.p99, b.latencyMs.p99, formatMs, false),
    compareNumberMetric('Avg latency', a.latencyMs.avg, b.latencyMs.avg, formatMs, false),
    compareNumberMetric('Total requests', a.totalRequests, b.totalRequests, (v) => String(v), true),
    compareNumberMetric('Failed requests', a.failedRequests, b.failedRequests, (v) => String(v), false),
  ];
}

/** Compares two persisted run records. */
export function compareLoadTestRuns(a: LoadTestRunRecord, b: LoadTestRunRecord): LoadTestRunCompareResult {
  return {
    runA: a,
    runB: b,
    metrics: compareLoadTestRunSummaries(a.summary, b.summary),
  };
}

/** Serializes a run record for export (clipboard or file). */
export function serializeLoadTestRunExport(record: LoadTestRunRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Builds a plain-text report for a run record. */
export function buildLoadTestRunReport(record: LoadTestRunRecord): string {
  const { summary, status, startedAt, finishedAt, thresholdResults } = record;
  const lines = [
    `Load test run: ${record.id}`,
    `Status: ${status}`,
    `Started: ${startedAt}`,
    finishedAt ? `Finished: ${finishedAt}` : '',
    '',
    'Summary',
    `- Success rate: ${summary.successRatePercent.toFixed(2)}%`,
    `- Error rate: ${summary.errorRatePercent.toFixed(2)}%`,
    `- Throughput: ${summary.requestsPerSec.toFixed(1)} rps (peak ${summary.peakRequestsPerSec.toFixed(1)} rps)`,
    `- Latency p95: ${summary.latencyMs.p95} ms`,
    `- Total requests: ${summary.totalRequests} (${summary.failedRequests} failed)`,
    `- Elapsed: ${summary.elapsedSec}s @ ${summary.virtualUsers} VUs`,
  ].filter(Boolean);

  if (thresholdResults.length > 0) {
    lines.push('', 'Thresholds');
    for (const result of thresholdResults) {
      lines.push(`- ${result.label}: ${result.pass ? 'PASS' : 'FAIL'} (${result.actual} vs ${result.expected})`);
    }
  }

  return lines.join('\n');
}

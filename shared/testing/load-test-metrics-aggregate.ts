import type { LoadTestLatencySnapshot } from './load-test-run.schema';

/** Returns a percentile value from a sorted ascending array. */
export function percentileFromSorted(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.max(0, Math.min(sorted.length - 1, rank));
  return sorted[index] ?? 0;
}

/** Builds latency percentiles from recent request timings (milliseconds). */
export function computeLatencySnapshot(latenciesMs: readonly number[]): LoadTestLatencySnapshot {
  if (latenciesMs.length === 0) {
    return { avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    avg: Math.round(sum / sorted.length),
    p50: Math.round(percentileFromSorted(sorted, 50)),
    p95: Math.round(percentileFromSorted(sorted, 95)),
    p99: Math.round(percentileFromSorted(sorted, 99)),
  };
}

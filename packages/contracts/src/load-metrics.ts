/**
 * Nearest-rank percentile for a list of sample durations.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0)
    return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

export interface AggregatedLoadMetrics {
  readonly requests: number;
  readonly errors: number;
  readonly rps: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

/** Arithmetic mean of a list of durations. Returns 0 for an empty list. */
export function averageMs(durationsMs: readonly number[]): number {
  if (durationsMs.length === 0)
    return 0;
  const sum = durationsMs.reduce((total, value) => total + value, 0);
  return sum / durationsMs.length;
}

export function aggregateLoadSamples(
  durationsMs: readonly number[],
  errorCount: number,
  elapsedMs: number,
): AggregatedLoadMetrics {
  const requests = durationsMs.length;
  const seconds = Math.max(elapsedMs, 1) / 1000;
  return {
    requests,
    errors: errorCount,
    rps: requests / seconds,
    avgMs: averageMs(durationsMs),
    p50Ms: percentile(durationsMs, 50),
    p95Ms: percentile(durationsMs, 95),
    p99Ms: percentile(durationsMs, 99),
  };
}

import { describe, expect, it } from 'vitest';

import { computeLatencySnapshot, percentileFromSorted } from './load-test-metrics-aggregate';

describe('load-test-metrics-aggregate', () => {
  it('computes percentiles from sorted latencies', () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(percentileFromSorted(sorted, 50)).toBe(30);
    expect(percentileFromSorted(sorted, 95)).toBe(50);
  });

  it('returns zeroed snapshot when empty', () => {
    expect(computeLatencySnapshot([])).toEqual({ avg: 0, p50: 0, p95: 0, p99: 0 });
  });

  it('computes avg and percentiles for samples', () => {
    const snapshot = computeLatencySnapshot([100, 200, 300]);
    expect(snapshot.avg).toBe(200);
    expect(snapshot.p50).toBe(200);
  });
});

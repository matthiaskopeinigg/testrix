import { describe, expect, it } from 'vitest';

import { emptyLoadArtifact, type LoadRunRecord } from './load-file';
import {
  buildEmptyLoadHealthOverview,
  buildLoadHealthOverview,
  levelFromScore,
  loadHealthThresholdsOf,
  type LoadHealthMetrics,
} from './load-metrics-health';
import { compareLoadRuns } from './load-run-diff';
import { buildLoadRunReport, generateK6Script, serializeLoadRunExport } from './load-script-export';

function metrics(overrides: Partial<LoadHealthMetrics> = {}): LoadHealthMetrics {
  return {
    rps: 50,
    peakRps: 60,
    errorRatePercent: 0.5,
    successRatePercent: 99.5,
    virtualUsers: 20,
    avgMs: 40,
    p50Ms: 35,
    p95Ms: 120,
    p99Ms: 200,
    samples: [],
    ...overrides,
  };
}

function run(overrides: Partial<LoadRunRecord> = {}): LoadRunRecord {
  return {
    id: 'r1',
    at: '2026-01-01T00:00:00.000Z',
    durationMs: 30_000,
    virtualUsers: 20,
    requests: 1500,
    errors: 8,
    p50Ms: 35,
    p95Ms: 120,
    p99Ms: 200,
    rps: 50,
    avgMs: 40,
    peakRps: 60,
    samples: [],
    ...overrides,
  };
}

describe('load metrics health', () => {
  it('maps artifact thresholds and drops disabled mins', () => {
    const base = emptyLoadArtifact();
    const thresholds = loadHealthThresholdsOf({ ...base, minSuccessRate: 0, minRps: 0 });
    expect(thresholds.minSuccessRate).toBeUndefined();
    expect(thresholds.minRps).toBeUndefined();
    expect(loadHealthThresholdsOf({ ...base, minSuccessRate: 99, minRps: 40 }).minSuccessRate).toBe(99);
  });

  it('scores a healthy run above a poor one', () => {
    const good = buildLoadHealthOverview(metrics(), { maxErrorRate: 5, maxP95Ms: 500 });
    const bad = buildLoadHealthOverview(
      metrics({ errorRatePercent: 30, successRatePercent: 70, p95Ms: 3000, rps: 2 }),
      { maxErrorRate: 5, maxP95Ms: 500 },
    );
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.checks).toHaveLength(5);
  });

  it('exposes empty and level helpers', () => {
    expect(buildEmptyLoadHealthOverview().checks).toHaveLength(0);
    expect(levelFromScore(90)).toBe('good');
    expect(levelFromScore(60)).toBe('ok');
    expect(levelFromScore(10)).toBe('bad');
  });
});

describe('load run diff and export', () => {
  it('compares two runs with directional deltas', () => {
    const a = run({ id: 'a', p95Ms: 200, errors: 30 });
    const b = run({ id: 'b', p95Ms: 120, errors: 8 });
    const result = compareLoadRuns(a, b);
    expect(result.metrics.find((m) => m.label === 'p95 latency')?.direction).toBe('better');
    expect(result.metrics.find((m) => m.label === 'Error rate')?.direction).toBe('better');
  });

  it('serializes JSON, a report, and a k6 script', () => {
    const artifact = emptyLoadArtifact();
    if (artifact.kind !== 'artifact')
      throw new Error('expected artifact');
    const context = { artifact: { ...artifact, url: 'https://example.test/api' }, run: run() };
    expect(serializeLoadRunExport(context.run)).toContain('"rps": 50');
    expect(buildLoadRunReport(context)).toContain('Throughput: 50.0 rps');
    const k6 = generateK6Script(context);
    expect(k6).toContain("import http from 'k6/http'");
    expect(k6).toContain('https://example.test/api');
  });
});

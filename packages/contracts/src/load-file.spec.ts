import { describe, expect, it } from 'vitest';

import {
  emptyLoadArtifact,
  evaluateLoadThresholds,
  loadRunStatusFrom,
  loadThresholdMissed,
  normalizeLoadSection,
  parseLoadFile,
} from './load-file';

describe('parseLoadFile', () => {
  it('parses nested profile/thresholds and defaults new fields', () => {
    const file = parseLoadFile({
      items: [
        {
          kind: 'artifact',
          id: 'load_1',
          name: 'Smoke',
          updatedAt: '2026-01-01T00:00:00.000Z',
          profile: { virtualUsers: 10, durationSec: 60, rampUpSec: 5 },
          thresholds: { maxErrorRate: 2, maxP95Ms: 800 },
          runs: [{ id: 'r1', at: '2026-01-01T00:00:00.000Z', durationMs: 1000, virtualUsers: 1, requests: 2, errors: 0, p50Ms: 10, p95Ms: 20, p99Ms: 30, rps: 2 }],
        },
      ],
    });
    const artifact = file.items[0];
    expect(artifact?.kind).toBe('artifact');
    if (artifact?.kind !== 'artifact')
      return;
    expect(artifact.virtualUsers).toBe(10);
    expect(artifact.durationSec).toBe(60);
    expect(artifact.maxErrorRate).toBe(2);
    expect(artifact.minSuccessRate).toBe(0);
    expect(artifact.minRps).toBe(0);
    expect(artifact.headers).toEqual([]);
    expect(artifact.body).toBe('');
    expect(artifact.runs[0]?.samples).toEqual([]);
  });

  it('preserves the docs section and normalizes legacy ids', () => {
    expect(normalizeLoadSection('docs')).toBe('docs');
    expect(normalizeLoadSection('thresholds')).toBe('thresholds');
    expect(normalizeLoadSection('results')).toBe('overview');
    expect(normalizeLoadSection('scenarios')).toBe('profile');
    expect(normalizeLoadSection('target')).toBe('target');
  });

  it('parses enriched run and sample fields', () => {
    const file = parseLoadFile({
      items: [
        {
          kind: 'artifact',
          id: 'load_1',
          name: 'Smoke',
          updatedAt: '2026-01-01T00:00:00.000Z',
          runs: [
            {
              id: 'r1',
              at: '2026-01-01T00:00:00.000Z',
              durationMs: 1000,
              virtualUsers: 5,
              requests: 20,
              errors: 1,
              p50Ms: 10,
              p95Ms: 20,
              p99Ms: 30,
              rps: 20,
              status: 'passed',
              avgMs: 12,
              peakRps: 25,
              successRatePercent: 95,
              errorRatePercent: 5,
              thresholdResults: [{ id: 'maxP95Ms', label: 'Max p95 latency', ok: true, actual: '20 ms', expected: '≤ 2000 ms' }],
              samples: [
                { elapsedMs: 500, requests: 10, errors: 0, rps: 20, p50Ms: 8, p95Ms: 18, p99Ms: 25, virtualUsers: 5, avgMs: 10, errorRatePercent: 0 },
              ],
            },
          ],
        },
      ],
    });
    const artifact = file.items[0];
    if (artifact?.kind !== 'artifact')
      throw new Error('expected artifact');
    const run = artifact.runs[0]!;
    expect(run.status).toBe('passed');
    expect(run.peakRps).toBe(25);
    expect(run.successRatePercent).toBe(95);
    expect(run.thresholdResults?.[0]?.ok).toBe(true);
    expect(run.samples[0]?.virtualUsers).toBe(5);
    expect(run.samples[0]?.avgMs).toBe(10);
  });

  it('detects threshold misses', () => {
    const base = emptyLoadArtifact();
    expect(loadThresholdMissed({ ...base, maxErrorRate: 5, maxP95Ms: 100 }, { requests: 10, errors: 1, p95Ms: 50, rps: 5 })).toBe(true);
    expect(loadThresholdMissed({ ...base, maxErrorRate: 20, maxP95Ms: 100, minSuccessRate: 95 }, { requests: 100, errors: 10, p95Ms: 50, rps: 5 })).toBe(true);
    expect(loadThresholdMissed({ ...base, maxErrorRate: 50, maxP95Ms: 1000, minRps: 10 }, { requests: 10, errors: 0, p95Ms: 50, rps: 2 })).toBe(true);
    expect(loadThresholdMissed({ ...base, maxErrorRate: 50, maxP95Ms: 1000 }, { requests: 10, errors: 0, p95Ms: 50, rps: 2 })).toBe(false);
  });

  it('returns per-threshold results and derives run status', () => {
    const base = emptyLoadArtifact();
    const results = evaluateLoadThresholds(
      { ...base, maxErrorRate: 5, maxP95Ms: 100, minSuccessRate: 95, minRps: 10 },
      { requests: 100, errors: 10, p95Ms: 200, rps: 5 },
    );
    expect(results).toHaveLength(4);
    expect(results.find((r) => r.id === 'maxP95Ms')?.ok).toBe(false);
    expect(results.find((r) => r.id === 'minRps')?.ok).toBe(false);
    expect(loadRunStatusFrom(base, { requests: 100, errors: 0, p95Ms: 50, rps: 20 })).toBe('passed');
    expect(loadRunStatusFrom({ ...base, maxP95Ms: 10 }, { requests: 100, errors: 0, p95Ms: 50, rps: 20 })).toBe('failed');
  });
});

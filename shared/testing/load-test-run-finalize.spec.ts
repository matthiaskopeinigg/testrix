import { describe, expect, it } from 'vitest';

import {
  buildThresholdResults,
  createLoadTestRunRecord,
  evaluateLoadTestRunStatus,
  prependLoadTestRun,
} from '@shared/testing';

describe('load-test-run-finalize', () => {
  const metrics = {
    running: false,
    elapsedSec: 60,
    virtualUsers: 10,
    totalRequests: 1000,
    failedRequests: 5,
    successRatePercent: 99.5,
    requestsPerSec: 55,
    peakRequestsPerSec: 62,
    errorRatePercent: 0.5,
    latencyMs: { avg: 120, p50: 100, p95: 200, p99: 250 },
    samples: [],
  };

  it('marks run failed when success rate below threshold', () => {
    const status = evaluateLoadTestRunStatus(metrics, { minSuccessRatePercent: 99.9 });
    expect(status).toBe('failed');
  });

  it('includes min success rate in threshold results', () => {
    const results = buildThresholdResults(metrics, { minSuccessRatePercent: 99 });
    const success = results.find((r) => r.label === 'Min success rate');
    expect(success?.pass).toBe(true);
  });

  it('creates a cancelled run record without re-evaluating to passed', () => {
    const record = createLoadTestRunRecord({
      id: 'run-1',
      metrics: { ...metrics, errorRatePercent: 50, successRatePercent: 50 },
      profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
      thresholds: { minSuccessRatePercent: 99 },
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'cancelled',
    });
    expect(record.status).toBe('cancelled');
  });

  it('prepends runs and trims to max', () => {
    const base = createLoadTestRunRecord({
      id: 'run-a',
      metrics,
      profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
      thresholds: {},
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'passed',
    });
    const next = prependLoadTestRun([base], { ...base, id: 'run-b' }, 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('run-b');
  });
});

import { describe, expect, it } from 'vitest';

import {
  applyLoadTestProfilePreset,
  buildLoadTestRunReport,
  compareLoadTestRuns,
  detectLoadTestProfilePreset,
  serializeLoadTestRunExport,
} from '@shared/testing';
import { createLoadTestRunRecord } from '@shared/testing/load-test-run-finalize';

describe('load-test-run-diff', () => {
  const baseMetrics = {
    running: false,
    elapsedSec: 60,
    virtualUsers: 10,
    totalRequests: 1000,
    failedRequests: 10,
    successRatePercent: 99,
    requestsPerSec: 50,
    peakRequestsPerSec: 55,
    errorRatePercent: 1,
    latencyMs: { avg: 100, p50: 90, p95: 150, p99: 180 },
    samples: [],
  };

  const makeRecord = (id: string, patch: Partial<typeof baseMetrics> = {}) =>
    createLoadTestRunRecord({
      id,
      metrics: { ...baseMetrics, ...patch },
      profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
      thresholds: {},
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'passed',
    });

  it('marks improved success rate as better', () => {
    const a = makeRecord('a');
    const b = makeRecord('b', { successRatePercent: 99.5 });
    const compare = compareLoadTestRuns(a, b);
    const success = compare.metrics.find((m) => m.label === 'Success rate');
    expect(success?.direction).toBe('better');
  });

  it('serializes run export as JSON', () => {
    const record = makeRecord('export-1');
    const json = serializeLoadTestRunExport(record);
    expect(JSON.parse(json).id).toBe('export-1');
  });

  it('builds a plain-text report', () => {
    const record = makeRecord('report-1');
    const report = buildLoadTestRunReport(record);
    expect(report).toContain('Success rate: 99.00%');
    expect(report).toContain('Status: passed');
  });
});

describe('load-test-profile-presets', () => {
  it('applies smoke preset profile and thresholds', () => {
    const result = applyLoadTestProfilePreset('smoke');
    expect(result.profile.virtualUsers).toBe(2);
    expect(result.suggestedThresholds?.minSuccessRatePercent).toBe(99);
  });

  it('detects matching preset', () => {
    const { profile } = applyLoadTestProfilePreset('soak');
    expect(detectLoadTestProfilePreset(profile)).toBe('soak');
  });
});

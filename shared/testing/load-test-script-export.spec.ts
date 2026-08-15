import { describe, expect, it } from 'vitest';

import type { LoadTestArtifact, LoadTestRunRecord } from './load-tests.schema';
import {
  generateGatlingSimulation,
  generateK6Script,
  generateLoadTestHtmlReport,
} from './load-test-script-export';

function sample(overrides: Partial<LoadTestRunRecord> = {}): {
  artifact: LoadTestArtifact;
  record: LoadTestRunRecord;
} {
  const record: LoadTestRunRecord = {
    id: 'run-1',
    startedAt: '2020-01-01T00:00:00.000Z',
    finishedAt: '2020-01-01T00:01:00.000Z',
    status: 'passed',
    profileSnapshot: { durationSec: 60, virtualUsers: 5, rampUpSec: 10 },
    thresholdsSnapshot: { maxP95LatencyMs: 400 },
    environmentId: 'env-1',
    environmentName: 'Staging',
    summary: {
      successRatePercent: 99,
      errorRatePercent: 1,
      requestsPerSec: 12,
      peakRequestsPerSec: 20,
      totalRequests: 720,
      failedRequests: 7,
      latencyMs: { avg: 40, p50: 30, p95: 80, p99: 120 },
      elapsedSec: 60,
      virtualUsers: 5,
    },
    samples: [{ elapsedSec: 5, virtualUsers: 5, requestsPerSec: 10, errorRatePercent: 0, p50LatencyMs: 20, p95LatencyMs: 40, avgLatencyMs: 25 }],
    thresholdResults: [{ label: 'p95', pass: true, expected: '< 400', actual: '80' }],
    ...overrides,
  };
  const artifact: LoadTestArtifact = {
    id: 'lt-1',
    name: 'Checkout API',
    description: '',
    tags: [],
    docs: '',
    targetSource: 'manual',
    manualTarget: {
      method: 'GET',
      url: 'https://api.example.com/health',
      headers: [],
      queryParams: [],
      body: '',
      bodyType: 'none',
      timeoutMs: 30_000,
    },
    profile: record.profileSnapshot,
    thresholds: record.thresholdsSnapshot,
    runs: [record],
    updatedAt: record.startedAt,
  };
  return { artifact, record };
}

describe('load-test-script-export', () => {
  it('includes environment name and target in the HTML report', () => {
    const html = generateLoadTestHtmlReport(sample());
    expect(html).toContain('Staging');
    expect(html).toContain('https://api.example.com/health');
    expect(html).toContain('PASS');
  });

  it('generates a k6 script with VUs and duration', () => {
    const script = generateK6Script(sample());
    expect(script).toContain("vus: 5");
    expect(script).toContain("duration: '60s'");
    expect(script).toContain('https://api.example.com/health');
  });

  it('generates a Gatling simulation stub', () => {
    const scala = generateGatlingSimulation(sample());
    expect(scala).toContain('class CheckoutAPI');
    expect(scala).toContain('rampUsers(5)');
  });
});

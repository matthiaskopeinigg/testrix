import { describe, expect, it } from 'vitest';

import {
  buildEmptyLoadTestHealthOverview,
  buildLoadTestHealthOverview,
  evaluateErrorRateHealth,
  evaluatePeakThroughputHealth,
  evaluateSuccessRateHealth,
  evaluateThroughputHealth,
  levelFromScore,
  scoreRatio,
  scoreThroughputHealth,
} from '@shared/testing';
import type { LoadTestMetricsSample } from '@shared/testing';

describe('load-test-metrics-health', () => {
  it('marks low error rate as good', () => {
    expect(evaluateErrorRateHealth(0.4, {}).level).toBe('good');
  });

  it('marks throughput below threshold as bad', () => {
    expect(evaluateThroughputHealth(20, { minRequestsPerSec: 50 }, 10).level).toBe('bad');
  });

  it('scores low virtual-user throughput fairly without a hard floor', () => {
    expect(scoreThroughputHealth(4.6, {}, 2)).toBeGreaterThanOrEqual(80);
    expect(evaluateThroughputHealth(4.6, {}, 2).level).toBe('good');
  });

  it('marks success rate below configured threshold as bad', () => {
    expect(evaluateSuccessRateHealth(98, { minSuccessRatePercent: 99 }).level).toBe('bad');
  });

  it('builds overall bad health when metrics are poor', () => {
    const overview = buildLoadTestHealthOverview(
      {
        running: false,
        elapsedSec: 10,
        virtualUsers: 10,
        totalRequests: 100,
        failedRequests: 20,
        successRatePercent: 80,
        requestsPerSec: 5,
        peakRequestsPerSec: 8,
        errorRatePercent: 20,
        latencyMs: { avg: 900, p50: 800, p95: 1200, p99: 1500 },
        samples: [],
      },
      { minRequestsPerSec: 50, maxErrorRatePercent: 1, maxP95LatencyMs: 200 },
    );
    expect(overview.level).toBe('bad');
    expect(overview.score).toBeLessThan(60);
  });

  it('derives health bands from continuous scores', () => {
    expect(levelFromScore(92)).toBe('good');
    expect(levelFromScore(72)).toBe('ok');
    expect(levelFromScore(40)).toBe('bad');
    expect(scoreRatio(1)).toBe(100);
    expect(scoreRatio(0.5)).toBeGreaterThan(25);
    expect(scoreRatio(0.5)).toBeLessThan(45);
  });

  it('uses recent sample variance for peak throughput stability', () => {
    const samples: LoadTestMetricsSample[] = [
      { elapsedSec: 1, virtualUsers: 10, requestsPerSec: 28, errorRatePercent: 0.4, p50LatencyMs: 50, p95LatencyMs: 95, avgLatencyMs: 46 },
      { elapsedSec: 1.5, virtualUsers: 10, requestsPerSec: 24, errorRatePercent: 0.4, p50LatencyMs: 50, p95LatencyMs: 95, avgLatencyMs: 46 },
      { elapsedSec: 2, virtualUsers: 10, requestsPerSec: 27, errorRatePercent: 0.4, p50LatencyMs: 50, p95LatencyMs: 95, avgLatencyMs: 46 },
    ];

    expect(
      evaluatePeakThroughputHealth(28, 27, samples).level,
    ).toBe('good');
    expect(
      evaluatePeakThroughputHealth(28, 24, samples).level,
    ).toBe('good');
  });

  it('builds empty health overview with zero score', () => {
    const overview = buildEmptyLoadTestHealthOverview();
    expect(overview.score).toBe(0);
    expect(overview.checks).toHaveLength(0);
  });

  it('keeps score stable when simulated throughput oscillates', () => {
    const samples: LoadTestMetricsSample[] = [];
    let peakRequestsPerSec = 0;

    for (let tick = 1; tick <= 24; tick += 1) {
      const elapsedSec = tick * 0.5;
      const requestsPerSec = 24 + Math.sin(elapsedSec / 3) * 4;
      peakRequestsPerSec = Math.max(peakRequestsPerSec, requestsPerSec);
      samples.push({
        elapsedSec,
        virtualUsers: 10,
        requestsPerSec,
        errorRatePercent: 0.4,
        p50LatencyMs: 50,
        p95LatencyMs: 95,
        avgLatencyMs: 46,
      });
    }

    const scores: number[] = [];
    for (let count = 6; count <= samples.length; count += 1) {
      const partial = samples.slice(0, count);
      const latest = partial[partial.length - 1]!;
      const overview = buildLoadTestHealthOverview(
        {
          running: true,
          elapsedSec: latest.elapsedSec,
          virtualUsers: 10,
          totalRequests: 1000,
          failedRequests: 4,
          successRatePercent: 99.6,
          requestsPerSec: latest.requestsPerSec,
          peakRequestsPerSec,
          errorRatePercent: latest.errorRatePercent,
          latencyMs: { avg: 46, p50: 50, p95: 95, p99: 120 },
          samples: partial,
        },
        {},
      );
      scores.push(overview.score);
    }

    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(6);
  });
});

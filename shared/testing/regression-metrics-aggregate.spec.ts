import { describe, expect, it } from 'vitest';

import {
  aggregateStepCounts,
  buildRegressionRunSummary,
  computeFlowDurationPercentiles,
  computeRegressionPassRatePercent,
  evaluateRegressionThresholds,
  meetsAcceptanceThreshold,
  percentile,
  requiredPassedFlows,
} from './regression-metrics-aggregate';
import type { RegressionFlowResult } from './regression-run.schema';

function flowResult(
  partial: Partial<RegressionFlowResult> & Pick<RegressionFlowResult, 'flowId' | 'flowName' | 'status'>,
): RegressionFlowResult {
  return {
    durationMs: 100,
    attemptCount: 1,
    validationFailures: [],
    passedStepCount: 1,
    failedStepCount: 0,
    skippedStepCount: 0,
    ...partial,
  };
}

describe('regression-metrics-aggregate', () => {
  it('computes pass rate from passed and failed flows', () => {
    expect(computeRegressionPassRatePercent(8, 2)).toBe(80);
    expect(computeRegressionPassRatePercent(0, 0)).toBe(0);
  });

  it('evaluates acceptance threshold', () => {
    expect(meetsAcceptanceThreshold(9, 1, 90)).toBe(true);
    expect(meetsAcceptanceThreshold(8, 2, 90)).toBe(false);
    expect(requiredPassedFlows(10, 90)).toBe(9);
  });

  it('computes flow duration percentiles', () => {
    const results = [
      flowResult({ flowId: 'a', flowName: 'A', status: 'passed', durationMs: 100 }),
      flowResult({ flowId: 'b', flowName: 'B', status: 'passed', durationMs: 200 }),
      flowResult({ flowId: 'c', flowName: 'C', status: 'failed', durationMs: 300 }),
    ];
    const stats = computeFlowDurationPercentiles(results);
    expect(stats.avg).toBe(200);
    expect(stats.p50).toBe(200);
    expect(stats.p95).toBe(300);
  });

  it('builds run summary with acceptance margin', () => {
    const results = [
      flowResult({ flowId: 'a', flowName: 'A', status: 'passed', passedStepCount: 2 }),
      flowResult({ flowId: 'b', flowName: 'B', status: 'failed', failedStepCount: 1 }),
    ];
    const summary = buildRegressionRunSummary(results, 5000, 100, [
      { workerSlot: 0 },
      { workerSlot: 1 },
    ]);
    expect(summary?.passRatePercent).toBe(50);
    expect(summary?.meetsAcceptance).toBe(false);
    expect(summary?.peakParallelism).toBe(2);
    expect(aggregateStepCounts(results).failedSteps).toBe(1);
  });

  it('evaluates regression thresholds', () => {
    const result = evaluateRegressionThresholds(9, 1, 4000, 250, {
      acceptancePercent: 90,
      maxFailedFlows: 1,
      maxTotalDurationMs: 5000,
      maxP95FlowDurationMs: 300,
    });
    expect(result.pass).toBe(true);
    expect(result.results.some((row) => row.label === 'Acceptance rate' && row.pass)).toBe(true);
  });

  it('computes percentile helper', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([], 50)).toBe(0);
  });
});

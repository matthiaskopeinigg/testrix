import { describe, expect, it } from 'vitest';

import {
  compareRegressionFlowResults,
  filterRegressionFlowDiffs,
} from './regression-flow-diff';
import type { RegressionFlowResult } from './regression-run.schema';

function flow(
  flowId: string,
  status: RegressionFlowResult['status'],
  durationMs: number,
): RegressionFlowResult {
  return {
    flowId,
    flowName: flowId,
    status,
    durationMs,
    attemptCount: 1,
    validationFailures: [],
    passedStepCount: status === 'passed' ? 1 : 0,
    failedStepCount: status === 'failed' ? 1 : 0,
    skippedStepCount: 0,
  };
}

describe('regression-flow-diff', () => {
  it('detects new failures and fixes', () => {
    const a = [flow('login', 'passed', 100), flow('checkout', 'passed', 200)];
    const b = [flow('login', 'passed', 100), flow('checkout', 'failed', 220)];
    const diffs = compareRegressionFlowResults(a, b);
    const checkout = diffs.find((row) => row.flowId === 'checkout');
    expect(checkout?.changeType).toBe('new_failure');
  });

  it('filters regressions only', () => {
    const a = [flow('login', 'passed', 100), flow('checkout', 'passed', 200)];
    const b = [flow('login', 'failed', 100), flow('checkout', 'passed', 400)];
    const diffs = compareRegressionFlowResults(a, b, 20);
    const regressions = filterRegressionFlowDiffs(diffs, 'regressions');
    expect(regressions.some((row) => row.flowId === 'login')).toBe(true);
    expect(regressions.some((row) => row.flowId === 'checkout')).toBe(true);
  });
});

import type { RegressionFlowResult, RegressionFlowResultStatus } from './regression-run.schema';

/** One recorded attempt inside a regression flow retry loop. */
export interface RegressionFlowAttemptSnapshot {
  readonly status: RegressionFlowResultStatus;
  readonly durationMs: number;
  readonly message?: string;
}

/** True when the flow passed only after an earlier failed attempt. */
export function isRegressionFlowFlaked(
  result: Pick<RegressionFlowResult, 'status' | 'flaked' | 'attempts' | 'attemptCount'>,
): boolean {
  if (result.flaked === true) {
    return result.status === 'passed';
  }
  if (result.status !== 'passed') {
    return false;
  }
  if (result.attempts && result.attempts.length > 0) {
    return result.attempts.some((attempt) => attempt.status === 'failed');
  }
  return (result.attemptCount ?? 1) > 1;
}

/** Counts flaked flows (passed after retry). */
export function countRegressionFlakedFlows(
  flowResults: readonly Pick<RegressionFlowResult, 'status' | 'flaked' | 'attempts' | 'attemptCount'>[],
): number {
  return flowResults.filter((result) => isRegressionFlowFlaked(result)).length;
}

/**
 * Passed / failed / flaked counts. When `countFlakesAsFailed` is false, flakes
 * stay in passed (default). When true, flakes move into failed.
 */
export function classifyRegressionFlowCounts(
  flowResults: readonly Pick<
    RegressionFlowResult,
    'status' | 'flaked' | 'attempts' | 'attemptCount'
  >[],
  countFlakesAsFailed = false,
): {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly flaked: number;
} {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaked = 0;
  for (const result of flowResults) {
    if (result.status === 'skipped' || result.status === 'cancelled') {
      skipped += 1;
      continue;
    }
    const flake = isRegressionFlowFlaked(result);
    if (flake) {
      flaked += 1;
      if (countFlakesAsFailed) {
        failed += 1;
      } else {
        passed += 1;
      }
      continue;
    }
    if (result.status === 'passed') {
      passed += 1;
    } else if (result.status === 'failed') {
      failed += 1;
    }
  }
  return { passed, failed, skipped, flaked };
}

/** Builds an attempt snapshot from a finished try. */
export function regressionAttemptFromStatus(
  status: RegressionFlowResultStatus,
  durationMs: number,
  message?: string,
): RegressionFlowAttemptSnapshot {
  return message
    ? { status, durationMs, message }
    : { status, durationMs };
}

import { describe, expect, it } from 'vitest';

import {
  classifyRegressionFlowCounts,
  countRegressionFlakedFlows,
  isRegressionFlowFlaked,
} from './regression-flake';

describe('regression-flake', () => {
  it('detects recovered retries as flaked', () => {
    expect(
      isRegressionFlowFlaked({
        status: 'passed',
        attemptCount: 2,
        flaked: true,
        attempts: [
          { status: 'failed', durationMs: 10, message: 'boom' },
          { status: 'passed', durationMs: 12 },
        ],
      }),
    ).toBe(true);
    expect(
      isRegressionFlowFlaked({
        status: 'passed',
        attemptCount: 1,
        attempts: [{ status: 'passed', durationMs: 8 }],
      }),
    ).toBe(false);
    expect(
      isRegressionFlowFlaked({
        status: 'failed',
        attemptCount: 3,
        attempts: [
          { status: 'failed', durationMs: 1 },
          { status: 'failed', durationMs: 1 },
          { status: 'failed', durationMs: 1 },
        ],
      }),
    ).toBe(false);
  });

  it('classifies flakes as passed by default', () => {
    const counts = classifyRegressionFlowCounts([
      { status: 'passed', attemptCount: 1 },
      { status: 'passed', attemptCount: 2, flaked: true },
      { status: 'failed', attemptCount: 2 },
      { status: 'skipped', attemptCount: 1 },
    ]);
    expect(counts).toEqual({ passed: 2, failed: 1, skipped: 1, flaked: 1 });
    expect(
      classifyRegressionFlowCounts(
        [
          { status: 'passed', attemptCount: 2, flaked: true },
          { status: 'failed', attemptCount: 1 },
        ],
        true,
      ),
    ).toEqual({ passed: 0, failed: 2, skipped: 0, flaked: 1 });
  });

  it('counts flaked flows', () => {
    expect(
      countRegressionFlakedFlows([
        { status: 'passed', attemptCount: 2, flaked: true },
        { status: 'passed', attemptCount: 1 },
      ]),
    ).toBe(1);
  });
});

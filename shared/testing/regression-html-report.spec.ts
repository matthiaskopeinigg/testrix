import { describe, expect, it } from 'vitest';

import { generateRegressionHtmlReport } from './regression-html-report';
import { createDefaultRegressionProfile } from './regression-run.schema';
import type { RegressionRun } from './regression-run.schema';

function run(partial: Partial<RegressionRun> = {}): RegressionRun {
  return {
    id: 'run-1',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    status: 'passed',
    passedCount: 1,
    failedCount: 0,
    skippedCount: 0,
    flakedCount: 1,
    profileSnapshot: createDefaultRegressionProfile(),
    thresholdsSnapshot: { acceptancePercent: 100 },
    flowResults: [
      {
        flowId: 'flow-1',
        flowName: 'Login',
        status: 'passed',
        durationMs: 120,
        attemptCount: 2,
        flaked: true,
        passedStepCount: 1,
        failedStepCount: 0,
        skippedStepCount: 0,
        validationFailures: [],
      },
    ],
    flowTimeline: [],
    samples: [],
    thresholdResults: [
      {
        label: 'Acceptance rate',
        pass: true,
        expected: '≥ 100%',
        actual: '100%',
      },
    ],
    ...partial,
  };
}

describe('generateRegressionHtmlReport', () => {
  it('includes flake counts and the flow table', () => {
    const html = generateRegressionHtmlReport({
      artifact: { name: 'Nightly', release: '1.2' },
      record: run(),
    });
    expect(html).toContain('Nightly');
    expect(html).toContain('Flaked: 1');
    expect(html).toContain('Login');
    expect(html).toContain('flaked');
  });

  it('includes compare diffs when a baseline run is provided', () => {
    const baseline = run({
      id: 'run-0',
      flowResults: [
        {
          flowId: 'flow-1',
          flowName: 'Login',
          status: 'failed',
          durationMs: 90,
          attemptCount: 1,
          passedStepCount: 0,
          failedStepCount: 1,
          skippedStepCount: 0,
          validationFailures: [],
        },
      ],
    });
    const html = generateRegressionHtmlReport({
      artifact: { name: 'Nightly', release: '' },
      record: run(),
      compareRecord: baseline,
    });
    expect(html).toContain('Compare vs');
    expect(html).toContain('fixed');
  });
});

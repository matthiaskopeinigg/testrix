import { describe, expect, it } from 'vitest';

import { overlayRegressionResultOnFlow } from './regression-flow-run-view';
import type { RegressionFlowResult } from './regression-run.schema';
import { createFlowStep } from './test-suites.schema';
import type { TestSuiteFlow } from './test-suites.schema';

function flowWithStep(stepId: string, name: string): TestSuiteFlow {
  const step = createFlowStep('REQUEST', name);
  step.id = stepId;
  return {
    id: 'flow-1',
    name: 'Login',
    description: '',
    tags: [],
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [step],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function failedResult(overrides: Partial<RegressionFlowResult> = {}): RegressionFlowResult {
  return {
    flowId: 'flow-1',
    flowName: 'Login',
    status: 'failed',
    durationMs: 420,
    attemptCount: 1,
    passedStepCount: 0,
    failedStepCount: 1,
    skippedStepCount: 0,
    validationFailures: [],
    stepStatuses: { 'step-1': 'failed' },
    stepDurations: { 'step-1': 420 },
    stepErrors: { 'step-1': 'HTTP 500' },
    stepCaptures: {
      'step-1': {
        kind: 'http_response',
        capturedAt: '2026-01-01T00:00:00.000Z',
        statusCode: 500,
        statusText: 'Error',
        bodyText: '{"ok":false}',
        headers: { 'content-type': 'application/json' },
      },
    },
    ...overrides,
  };
}

describe('overlayRegressionResultOnFlow', () => {
  it('copies this run’s status, error, and capture onto the live flow steps', () => {
    const overlaid = overlayRegressionResultOnFlow(flowWithStep('step-1', 'Get users'), failedResult());
    const step = overlaid.nodes[0];
    expect(overlaid.lastRunStatus).toBe('failed');
    expect(overlaid.lastRunDurationMs).toBe(420);
    expect(step).toMatchObject({
      id: 'step-1',
      name: 'Get users',
      lastRunStatus: 'failed',
      lastRunDurationMs: 420,
      error: 'HTTP 500',
    });
    expect(step.type === 'step' && step.lastRunCapture?.kind).toBe('http_response');
  });

  it('synthesizes steps when the flow definition is missing', () => {
    const overlaid = overlayRegressionResultOnFlow(null, failedResult());
    expect(overlaid.nodes).toHaveLength(1);
    expect(overlaid.nodes[0]).toMatchObject({
      id: 'step-1',
      stepType: 'REQUEST',
      lastRunStatus: 'failed',
    });
  });
});

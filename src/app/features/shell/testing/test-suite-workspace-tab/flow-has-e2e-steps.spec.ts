import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import { flowHasE2eSteps } from './flow-has-e2e-steps';

describe('flowHasE2eSteps', () => {
  it('returns false when no E2E steps exist', () => {
    expect(flowHasE2eSteps([createFlowStep('REQUEST', 'Get health')])).toBe(false);
  });

  it('returns true when an E2E step exists', () => {
    expect(flowHasE2eSteps([createFlowStep('E2E', 'Open app')])).toBe(true);
  });

  it('returns true when an HTTP interceptor step exists', () => {
    expect(flowHasE2eSteps([createFlowStep('HTTP_INTERCEPTOR', 'Rewrite login')])).toBe(true);
  });
});

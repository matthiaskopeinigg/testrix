import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import {
  flowStepPrimaryLabel,
  flowStepSecondaryLabel,
  flowStepTreeSubtitle,
  FLOW_STEP_GUIDED_TITLES,
} from './flow-step-labels';

describe('flow-step-labels', () => {
  it('uses guided title when step name is empty', () => {
    const step = createFlowStep('REQUEST', '');
    expect(flowStepPrimaryLabel(step.name, step.stepType)).toBe(FLOW_STEP_GUIDED_TITLES.REQUEST);
    expect(flowStepSecondaryLabel(step.name, step.stepType)).toBeUndefined();
  });

  it('shows guided title as subtitle when name is custom', () => {
    expect(flowStepPrimaryLabel('My request', 'REQUEST')).toBe('My request');
    expect(flowStepSecondaryLabel('My request', 'REQUEST')).toBe(FLOW_STEP_GUIDED_TITLES.REQUEST);
  });

  it('builds interceptor tree subtitle with action and match pattern', () => {
    const step = createFlowStep('HTTP_INTERCEPTOR', 'Rewrite login');
    step.config = {
      urlPattern: '**/login',
      method: 'POST',
      interceptAction: 'modify',
      matchPhase: 'request',
      amendHeaders: [],
      amendQueryParams: [],
    };

    expect(flowStepTreeSubtitle(step)).toBe(
      'Intercept outgoing request · Modify · POST **/login',
    );
  });
});

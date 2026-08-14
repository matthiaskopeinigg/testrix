import { describe, expect, it } from 'vitest';

import type { TestSuiteFlow } from '@shared/testing';

import { buildPriorStepOptions } from './flow-step-picker-options';

describe('flow-step-picker-options', () => {
  it('lists prior steps only', () => {
    const flow = {
      id: 'f1',
      name: 'Flow',
      nodes: [
        { type: 'step', id: 'a', name: 'A', enabled: true, stepType: 'WAIT', config: {} },
        { type: 'step', id: 'b', name: 'B', enabled: true, stepType: 'REQUEST', config: {} },
      ],
    } as TestSuiteFlow;

    expect(buildPriorStepOptions(flow, 'b').map((o) => o.value)).toEqual(['a']);
  });
});

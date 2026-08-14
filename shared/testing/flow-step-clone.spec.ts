import { describe, expect, it } from 'vitest';

import { cloneFlowStepNode } from './flow-step-clone';
import { createFlowStep } from './test-suites.schema';

describe('cloneFlowStepNode', () => {
  it('inserts a copy after the source step with cleared run metadata', () => {
    const stepA = createFlowStep('REQUEST', 'Get health');
    stepA.id = 'step-a';
    stepA.lastRunStatus = 'passed';

    const stepB = createFlowStep('WAIT', 'Wait');
    stepB.id = 'step-b';

    const result = cloneFlowStepNode([stepA, stepB], 'step-a', 'step-a-copy');
    expect(result).not.toBeNull();
    expect(result!.nodes.map((node) => node.id)).toEqual(['step-a', 'step-a-copy', 'step-b']);
    expect(result!.step.name).toBe('Get health copy');
    expect(result!.step.lastRunStatus).toBe('never');
    expect(result!.step.lastRunCapture).toBeNull();
    expect(result!.step.config).toEqual(stepA.config);
    expect(result!.step.config).not.toBe(stepA.config);
  });
});

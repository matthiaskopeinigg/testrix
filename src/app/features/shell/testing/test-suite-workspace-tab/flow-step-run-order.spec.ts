import { describe, expect, it } from 'vitest';

import { createFlowStep } from '@shared/testing';

import {
  buildFlowStepRunOrderIndex,
  findFlowNodeById,
  flowStepIndexInRunOrder,
} from './flow-step-run-order';

describe('flowStepRunOrder', () => {
  it('assigns run order to enabled steps only', () => {
    const enabled = createFlowStep('REQUEST', 'A');
    enabled.id = 'a';
    const disabled = createFlowStep('WAIT', 'B');
    disabled.id = 'b';
    disabled.enabled = false;
    const nodes = [enabled, disabled];

    expect(flowStepIndexInRunOrder('a', nodes)).toBe(1);
    expect(flowStepIndexInRunOrder('b', nodes)).toBeNull();
    expect(buildFlowStepRunOrderIndex(nodes)).toEqual({ a: 1 });
  });

  it('finds nested nodes by id', () => {
    const step = createFlowStep('WAIT', 'Wait');
    step.id = 'step-1';
    const nodes = [
      {
        id: 'fld-1',
        type: 'folder' as const,
        name: 'Folder',
        parentId: null,
        expanded: true,
        children: [step],
      },
    ];
    expect(findFlowNodeById(nodes, 'step-1')?.id).toBe('step-1');
    expect(findFlowNodeById(nodes, 'fld-1')?.id).toBe('fld-1');
  });

  it('finds steps nested under IF lanes', () => {
    const inner = createFlowStep('REQUEST', 'Then request', null, 'req-1');
    const iff = createFlowStep('IF', 'Branch', null, 'if-1');
    const thenLane = iff.children?.find((node) => node.type === 'lane');
    if (thenLane && thenLane.type === 'lane') {
      (thenLane as { children: typeof thenLane.children }).children = [inner];
    }
    expect(findFlowNodeById([iff], 'req-1')?.id).toBe('req-1');
    expect(buildFlowStepRunOrderIndex([iff])).toEqual({ 'if-1': 1, 'req-1': 2 });
  });
});

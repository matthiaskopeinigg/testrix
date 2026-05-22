import { describe, expect, it } from 'vitest';

import { createFlowFolder, createFlowStep } from '@shared/testing';

import {
  fromFlowStepTreeNodesWithExisting,
  toFlowStepTreeNodes,
} from './test-suite-flow-tree.adapter';

describe('test-suite-flow-tree.adapter', () => {
  it('flattens folder nodes when mapping to tree nodes', () => {
    const step = createFlowStep('REQUEST', 'Request');
    step.id = 'step-1';
    const folder = { ...createFlowFolder('Group'), id: 'fld-1', children: [step] as const };
    const tree = toFlowStepTreeNodes([folder]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('step-1');
    expect(tree[0]?.data?.kind).toBe('step');
  });

  it('round-trips flat steps and preserves configs', () => {
    const step = createFlowStep('REQUEST', 'Request');
    step.id = 'step-1';
    const nodes = [step];
    const tree = toFlowStepTreeNodes(nodes);
    const restored = fromFlowStepTreeNodesWithExisting(tree, nodes);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.type).toBe('step');
    expect(restored[0]?.id).toBe('step-1');
  });

  it('shows interceptor match details in the tree subtitle', () => {
    const step = createFlowStep('HTTP_INTERCEPTOR', '');
    step.id = 'step-interceptor';
    step.config = {
      urlPattern: '/api/*',
      method: 'GET',
      interceptAction: 'block',
      matchPhase: 'request',
      amendHeaders: [],
      amendQueryParams: [],
    };

    const tree = toFlowStepTreeNodes([step]);
    expect(tree[0]?.icon).toBe('interceptor');
    expect(tree[0]?.subtitle).toBe('Block · GET /api/*');
  });

  it('shows validation reference in subtitle and tree meta', () => {
    const request = createFlowStep('REQUEST', 'Get health');
    request.id = 'step-req';
    const validation = createFlowStep('VALIDATION', 'Check status');
    validation.id = 'step-val';
    validation.config = { refStepId: 'step-req', rules: [] };

    const tree = toFlowStepTreeNodes([request, validation]);
    expect(tree[1]?.subtitle).toBe('Validates → Get health');
    expect(tree[1]?.data?.refStepId).toBe('step-req');
  });
});

import { describe, expect, it } from 'vitest';

import { collectTriggerCallGraph } from './collect-trigger-graph';
import { createFlowStep } from './test-suites.schema';
import type { TestSuiteFlow, TestSuiteTreeItem } from './test-suites.schema';

function flowWithTrigger(
  id: string,
  name: string,
  target: { targetType: 'flow' | 'folder'; targetId: string; enabled?: boolean },
): TestSuiteFlow {
  const step = createFlowStep('TRIGGER', `Call ${target.targetId}`);
  step.config = {
    targetType: target.targetType,
    targetId: target.targetId,
    reuseE2eSession: true,
  };
  if (target.enabled === false) {
    (step as { enabled: boolean }).enabled = false;
  }
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [step],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function plainFlow(id: string, name: string): TestSuiteFlow {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function folder(
  id: string,
  name: string,
  children: readonly TestSuiteTreeItem[],
): TestSuiteTreeItem {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    children,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('collectTriggerCallGraph', () => {
  it('expands folder TRIGGER targets to descendant flows', () => {
    const login = flowWithTrigger('login', 'Login', { targetType: 'folder', targetId: 'shop' });
    const checkout = plainFlow('checkout', 'Checkout');
    const pay = plainFlow('pay', 'Pay');
    const tree: readonly TestSuiteTreeItem[] = [
      login,
      folder('shop', 'Shop', [checkout, pay]),
    ];
    const graph = collectTriggerCallGraph(tree);
    expect(graph.edges.map((edge) => `${edge.fromFlowId}->${edge.toFlowId}`).sort()).toEqual([
      'login->checkout',
      'login->pay',
    ]);
  });

  it('marks disabled TRIGGER edges as muted', () => {
    const login = flowWithTrigger('login', 'Login', {
      targetType: 'flow',
      targetId: 'checkout',
      enabled: false,
    });
    const checkout = plainFlow('checkout', 'Checkout');
    const graph = collectTriggerCallGraph([login, checkout]);
    expect(graph.edges).toEqual([
      expect.objectContaining({ fromFlowId: 'login', toFlowId: 'checkout', muted: true }),
    ]);
  });

  it('highlights a static cycle', () => {
    const a = flowWithTrigger('a', 'A', { targetType: 'flow', targetId: 'b' });
    const b = flowWithTrigger('b', 'B', { targetType: 'flow', targetId: 'a' });
    const graph = collectTriggerCallGraph([a, b]);
    expect(graph.edges.every((edge) => edge.cyclic)).toBe(true);
    expect(graph.nodes.every((node) => node.cyclic)).toBe(true);
  });

  it('returns an empty graph when there are no TRIGGER steps', () => {
    const graph = collectTriggerCallGraph([plainFlow('solo', 'Solo')]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

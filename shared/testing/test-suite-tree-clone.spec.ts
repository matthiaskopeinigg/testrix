import { describe, expect, it } from 'vitest';

import { cloneTestSuiteTreeItem } from './test-suite-tree-clone';
import { createFlowFolder, createFlowStep, isTestSuiteFlow } from './test-suites.schema';
import type { TestSuiteFlow } from './test-suites.schema';

function flow(overrides: Partial<TestSuiteFlow> & Pick<TestSuiteFlow, 'id' | 'name'>): TestSuiteFlow {
  return {
    description: '',
    tags: [],
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('cloneTestSuiteTreeItem', () => {
  it('appends (copy) to the flow name and keeps step names', () => {
    const getHealth = { ...createFlowStep('REQUEST', 'Get health'), id: 'step-a' };
    const wait = { ...createFlowStep('WAIT', 'Wait'), id: 'step-b' };
    const group = { ...createFlowFolder('Setup'), id: 'folder-a', children: [getHealth] };
    const source = flow({
      id: 'flow-a',
      name: 'Checkout',
      lastRunStatus: 'passed',
      nodes: [group, wait],
    });

    const copy = cloneTestSuiteTreeItem(source);
    expect(isTestSuiteFlow(copy)).toBe(true);
    if (!isTestSuiteFlow(copy)) {
      return;
    }

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Checkout (copy)');
    expect(copy.lastRunStatus).toBe('never');
    expect(copy.nodes).toHaveLength(2);

    const clonedFolder = copy.nodes[0];
    expect(clonedFolder?.type).toBe('folder');
    if (clonedFolder?.type !== 'folder') {
      return;
    }
    expect(clonedFolder.id).not.toBe('folder-a');
    expect(clonedFolder.name).toBe('Setup');
    expect(clonedFolder.children[0]?.name).toBe('Get health');
    expect(clonedFolder.children[0]?.id).not.toBe('step-a');

    expect(copy.nodes[1]?.name).toBe('Wait');
    expect(copy.nodes[1]?.id).not.toBe('step-b');
  });
});

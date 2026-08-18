import { describe, expect, it } from 'vitest';

import type { TestSuiteFlow, TestSuiteTreeItem } from '@shared/testing';

import { buildPriorStepOptions, buildTriggerTargetTree, omitFlowFromSuiteTree } from './flow-step-picker-options';

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

  it('lists REQUEST steps inside an IF Then lane as prior steps', () => {
    const inner = {
      type: 'step' as const,
      id: 'req-1',
      name: 'Then request',
      enabled: true,
      stepType: 'REQUEST' as const,
      config: {},
      parentId: null,
    };
    const iff = {
      type: 'step' as const,
      id: 'if-1',
      name: 'Branch',
      enabled: true,
      stepType: 'IF' as const,
      config: {},
      parentId: null,
      children: [
        {
          type: 'lane' as const,
          id: 'then-1',
          laneKind: 'then' as const,
          name: 'Then',
          parentId: 'if-1',
          children: [inner],
        },
      ],
    };
    const validation = {
      type: 'step' as const,
      id: 'val-1',
      name: 'Validate',
      enabled: true,
      stepType: 'VALIDATION' as const,
      config: {},
      parentId: null,
    };
    const flow = {
      id: 'f1',
      name: 'Flow',
      nodes: [iff, validation],
    } as TestSuiteFlow;

    expect(buildPriorStepOptions(flow, 'val-1').map((o) => o.value)).toEqual(['if-1', 'req-1']);
  });

  it('omits the current flow from the TRIGGER tree', () => {
    const items: readonly TestSuiteTreeItem[] = [
      {
        id: 'auth',
        name: 'Auth',
        description: '',
        tags: [],
        children: [
          {
            id: 'login',
            name: 'Login',
            description: '',
            tags: [],
            lastRunStatus: 'never',
            lastRunAt: null,
            nodes: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'logout',
            name: 'Logout',
            description: '',
            tags: [],
            lastRunStatus: 'never',
            lastRunAt: null,
            nodes: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const omitted = omitFlowFromSuiteTree(items, 'login');
    expect(omitted).toHaveLength(1);
    const folder = omitted[0];
    expect(folder && 'children' in folder ? folder.children.map((child) => child.id) : []).toEqual([
      'logout',
    ]);

    const flowTree = buildTriggerTargetTree(items, 'flow', 'login');
    expect(collectIds(flowTree)).toEqual(['auth', 'logout']);

    const folderTree = buildTriggerTargetTree(items, 'folder', 'login');
    expect(collectIds(folderTree)).toEqual(['auth', 'login', 'logout']);
  });
});

function collectIds(nodes: readonly { id: string; children?: readonly { id: string }[] }[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly { id: string; children?: readonly { id: string }[] }[]): void => {
    for (const node of list) {
      ids.push(node.id);
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

import { describe, expect, it } from 'vitest';

import {
  createFlowStep,
  isTestSuiteFlow,
  isTestSuiteFolder,
  testSuitesFileSchema,
  type TestSuiteFlow,
  type TestSuiteFolder,
  type TestSuiteTreeItem,
} from '@shared/testing';

import {
  fromTestSuiteTreeNodesWithExisting,
  toTestSuiteTreeNodes,
} from './test-suite-tree.adapter';

const UPDATED_AT = '2026-01-01T00:00:00.000Z';

function flowWithStep(id: string, name: string, stepId: string): TestSuiteFlow {
  const step = { ...createFlowStep('REQUEST', 'HTTP Request'), id: stepId };
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [step],
    updatedAt: UPDATED_AT,
  };
}

function folder(id: string, name: string, children: TestSuiteTreeItem[]): TestSuiteFolder {
  return {
    id,
    name,
    description: '',
    tags: [],
    environmentId: null,
    children,
    updatedAt: UPDATED_AT,
  };
}

describe('test-suite-tree.adapter', () => {
  it('round-trips a nested flow and preserves steps', () => {
    const file = testSuitesFileSchema.parse({
      schemaVersion: 1,
      suites: [
        {
          id: 'root-suite',
          name: 'Test Suite',
          flows: [folder('fld-a', 'Alpha', [flowWithStep('flw-1', 'Login', 'step-1')])],
          updatedAt: UPDATED_AT,
        },
      ],
    });

    const items = file.suites[0]?.flows ?? [];
    const tree = toTestSuiteTreeNodes(items);
    const merged = fromTestSuiteTreeNodesWithExisting(tree, items);

    expect(merged).toEqual(items);
    const nested = isTestSuiteFolder(merged[0]!) ? merged[0].children[0] : null;
    expect(nested && isTestSuiteFlow(nested) ? nested.nodes : []).toHaveLength(1);
  });

  it('keeps flow steps when a flow is moved into another folder', () => {
    const login = flowWithStep('flw-1', 'Login', 'step-1');
    const existing: TestSuiteTreeItem[] = [
      folder('fld-a', 'Alpha', [login]),
      folder('fld-b', 'Beta', []),
    ];

    const tree = toTestSuiteTreeNodes(existing);
    const alpha = tree[0];
    const beta = tree[1];
    const moved = {
      ...beta!,
      children: [...(alpha?.children ?? [])],
    };
    const nextTree = [{ ...alpha!, children: [] }, moved];

    const merged = fromTestSuiteTreeNodesWithExisting(nextTree, existing);
    const dest = merged.find((item) => item.id === 'fld-b');
    const movedFlow = dest && isTestSuiteFolder(dest) ? dest.children[0] : null;

    expect(movedFlow && isTestSuiteFlow(movedFlow) ? movedFlow.nodes : []).toHaveLength(1);
    expect(movedFlow && isTestSuiteFlow(movedFlow) ? movedFlow.nodes[0]?.id : null).toBe('step-1');
  });

  it('keeps nested flow steps when a folder is nested under another folder', () => {
    const login = flowWithStep('flw-1', 'Login', 'step-1');
    const existing: TestSuiteTreeItem[] = [
      folder('fld-a', 'Alpha', [login]),
      folder('fld-b', 'Beta', []),
    ];

    const tree = toTestSuiteTreeNodes(existing);
    const alpha = tree[0];
    const beta = tree[1];
    const nextTree = [
      {
        ...beta!,
        children: [alpha!],
      },
    ];

    const merged = fromTestSuiteTreeNodesWithExisting(nextTree, existing);
    const dest = merged[0];
    const nestedFolder = dest && isTestSuiteFolder(dest) ? dest.children[0] : null;
    const nestedFlow =
      nestedFolder && isTestSuiteFolder(nestedFolder) ? nestedFolder.children[0] : null;

    expect(nestedFlow && isTestSuiteFlow(nestedFlow) ? nestedFlow.nodes : []).toHaveLength(1);
    expect(nestedFlow && isTestSuiteFlow(nestedFlow) ? nestedFlow.nodes[0]?.id : null).toBe(
      'step-1',
    );
  });

  it('keeps steps when mixed folder and flow siblings are reordered', () => {
    const login = flowWithStep('flw-1', 'Login', 'step-1');
    const nested = flowWithStep('flw-2', 'Nested', 'step-2');
    const existing: TestSuiteTreeItem[] = [
      folder('fld-a', 'Alpha', [nested]),
      login,
    ];

    const tree = toTestSuiteTreeNodes(existing);
    const merged = fromTestSuiteTreeNodesWithExisting([tree[1]!, tree[0]!], existing);

    expect(merged.map((item) => item.id)).toEqual(['flw-1', 'fld-a']);
    expect(isTestSuiteFlow(merged[0]!) ? merged[0].nodes[0]?.id : null).toBe('step-1');
    const reorderedFolder = merged[1];
    const child =
      reorderedFolder && isTestSuiteFolder(reorderedFolder) ? reorderedFolder.children[0] : null;
    expect(child && isTestSuiteFlow(child) ? child.nodes[0]?.id : null).toBe('step-2');
  });
});

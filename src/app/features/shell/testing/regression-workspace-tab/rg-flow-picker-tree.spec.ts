import { describe, expect, it } from 'vitest';

import type { TestSuiteTreeNode } from '../test-suite-sidebar-panel/test-suite-tree.types';

import {
  collectFlowIdsFromTree,
  collectFlowIdsInSubtree,
  orderRegressionFlowIds,
  toggleFlowInSelection,
  toggleFolderInSelection,
} from './rg-flow-picker-tree';

const tree: readonly TestSuiteTreeNode[] = [
  {
    id: 'folder-a',
    label: 'Folder A',
    kind: 'folder',
    data: { kind: 'folder' },
    children: [
      {
        id: 'flow-1',
        label: 'Flow 1',
        kind: 'flow',
        data: { kind: 'flow' },
      },
      {
        id: 'flow-2',
        label: 'Flow 2',
        kind: 'flow',
        data: { kind: 'flow' },
      },
    ],
  },
  {
    id: 'flow-3',
    label: 'Flow 3',
    kind: 'flow',
    data: { kind: 'flow' },
  },
];

describe('rg-flow-picker-tree', () => {
  it('collects flow ids from folders and roots', () => {
    expect(collectFlowIdsFromTree(tree)).toEqual(['flow-1', 'flow-2', 'flow-3']);
    expect(collectFlowIdsInSubtree(tree[0]!)).toEqual(['flow-1', 'flow-2']);
  });

  it('toggles individual flows', () => {
    expect(toggleFlowInSelection([], 'flow-1')).toEqual(['flow-1']);
    expect(toggleFlowInSelection(['flow-1'], 'flow-1')).toEqual([]);
  });

  it('toggles all flows in a folder', () => {
    expect(toggleFolderInSelection([], tree[0]!)).toEqual(['flow-1', 'flow-2']);
    expect(toggleFolderInSelection(['flow-1', 'flow-2'], tree[0]!)).toEqual([]);
  });

  it('orders selected ids by tree traversal', () => {
    expect(orderRegressionFlowIds(tree, ['flow-3', 'flow-1'])).toEqual(['flow-1', 'flow-3']);
  });
});

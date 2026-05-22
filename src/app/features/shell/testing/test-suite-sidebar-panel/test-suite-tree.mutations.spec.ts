import { describe, expect, it } from 'vitest';

import { TEST_SUITE_MAX_FOLDER_DEPTH } from '@shared/testing';

import {
  createTestSuiteNode,
  wouldExceedTestSuiteFolderDepth,
} from './test-suite-tree.mutations';
import type { TestSuiteTreeNode } from './test-suite-tree.types';

function buildFolderChain(depth: number, prefix = 'f'): TestSuiteTreeNode[] {
  if (depth <= 0) {
    return [];
  }
  const id = `${prefix}-${depth}`;
  return [
    {
      id,
      label: id,
      kind: 'folder',
      icon: 'folder',
      data: { kind: 'folder' },
      children: buildFolderChain(depth - 1, prefix),
    },
  ];
}

describe('test-suite-tree.mutations', () => {
  it('blocks creating a folder when parent is at max depth', () => {
    const nodes = buildFolderChain(TEST_SUITE_MAX_FOLDER_DEPTH);
    const deepestId = 'f-1';
    expect(wouldExceedTestSuiteFolderDepth(nodes, deepestId)).toBe(true);
    expect(createTestSuiteNode(nodes, 'folder', deepestId)).toBeNull();
  });

  it('allows a folder under a parent one level below max', () => {
    const nodes = buildFolderChain(TEST_SUITE_MAX_FOLDER_DEPTH - 1);
    const parentId = 'f-1';
    expect(wouldExceedTestSuiteFolderDepth(nodes, parentId)).toBe(false);
    expect(createTestSuiteNode(nodes, 'folder', parentId)).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  canCreateLoadTestFolder,
  createLoadTestNode,
  deleteLoadTestNode,
  findLoadTestNode,
} from './load-test-tree.mutations';
import type { LoadTestTreeNode } from './load-test-tree.types';

const ROOT_ARTIFACT: LoadTestTreeNode = {
  id: 'a1',
  label: 'Root test',
  kind: 'artifact',
  icon: 'zap',
  data: { kind: 'artifact' },
};

const ROOT_FOLDER: LoadTestTreeNode = {
  id: 'f1',
  label: 'Folder',
  kind: 'folder',
  icon: 'folder',
  data: { kind: 'folder' },
  children: [ROOT_ARTIFACT],
};

describe('load-test-tree.mutations', () => {
  it('denies creating folders under a folder', () => {
    expect(canCreateLoadTestFolder(null)).toBe(true);
    expect(canCreateLoadTestFolder('f1')).toBe(false);
    expect(createLoadTestNode([ROOT_FOLDER], 'f1', 'folder')).toBeNull();
  });

  it('creates artifacts under folders', () => {
    const result = createLoadTestNode([ROOT_FOLDER], 'f1', 'artifact', 'Nested');
    expect(result).not.toBeNull();
    expect(findLoadTestNode(result!.nodes, result!.nodeId)?.parent?.id).toBe('f1');
  });

  it('deletes nodes and their subtree', () => {
    const next = deleteLoadTestNode([ROOT_FOLDER], 'f1');
    expect(next).toEqual([]);
  });
});

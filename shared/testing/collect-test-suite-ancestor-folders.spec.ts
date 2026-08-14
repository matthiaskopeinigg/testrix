import { describe, expect, it } from 'vitest';

import { findTestSuiteFlowInTree } from './collect-test-suite-ancestor-folders';
import type { TestSuiteTreeItem } from './test-suites.schema';

const tree: readonly TestSuiteTreeItem[] = [
  {
    id: 'root-folder',
    name: 'Root',
    description: '',
    tags: [],
    environmentId: 'env-root',
    children: [
      {
        id: 'child-folder',
        name: 'Child',
        description: '',
        tags: [],
        environmentId: 'env-child',
        children: [
          {
            id: 'flow-1',
            name: 'Flow',
            description: '',
            tags: [],
            environmentId: null,
            lastRunStatus: 'never',
            lastRunAt: null,
            nodes: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('findTestSuiteFlowInTree', () => {
  it('returns ancestor folders from root to parent', () => {
    const location = findTestSuiteFlowInTree(tree, 'flow-1');
    expect(location?.flow.id).toBe('flow-1');
    expect(location?.ancestorFolders.map((folder) => folder.id)).toEqual([
      'root-folder',
      'child-folder',
    ]);
    expect(location?.ancestorFolders[1]?.environmentId).toBe('env-child');
  });
});

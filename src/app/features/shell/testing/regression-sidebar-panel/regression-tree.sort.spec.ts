import { describe, expect, it } from 'vitest';

import { sortRegressionTree } from './regression-tree.sort';
import type { RegressionTreeNode } from './regression-tree.types';

describe('sortRegressionTree', () => {
  const nodes: RegressionTreeNode[] = [
    {
      id: 'b',
      label: 'Beta',
      kind: 'artifact',
      data: { kind: 'artifact', updatedAt: '2026-01-02T00:00:00.000Z', createdAt: '2026-01-02T00:00:00.000Z' },
    },
    {
      id: 'a',
      label: 'Alpha',
      kind: 'artifact',
      data: { kind: 'artifact', updatedAt: '2026-01-03T00:00:00.000Z', createdAt: '2026-01-03T00:00:00.000Z' },
    },
  ];

  it('preserves order when sort is saved', () => {
    expect(sortRegressionTree(nodes, 'saved').map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('sorts siblings by name ascending', () => {
    expect(sortRegressionTree(nodes, 'name-asc').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('sorts siblings by updated date newest first', () => {
    expect(sortRegressionTree(nodes, 'date-new').map((n) => n.id)).toEqual(['a', 'b']);
  });
});

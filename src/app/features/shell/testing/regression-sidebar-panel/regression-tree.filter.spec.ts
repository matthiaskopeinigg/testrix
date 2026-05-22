import { describe, expect, it } from 'vitest';

import { partitionRegressionArchived } from './regression-tree.filter';
import type { RegressionTreeNode } from './regression-tree.types';

function node(
  id: string,
  kind: 'folder' | 'artifact',
  archivedAt?: string | null,
  children?: RegressionTreeNode[],
): RegressionTreeNode {
  return {
    id,
    label: id,
    kind,
    icon: kind === 'folder' ? 'folder' : 'target',
    data: { kind, archivedAt: archivedAt ?? null },
    children,
  };
}

describe('partitionRegressionArchived', () => {
  it('splits active and archived nodes', () => {
    const tree = [
      node('active', 'artifact'),
      node('archived', 'artifact', '2026-01-01T00:00:00.000Z'),
      node('folder', 'folder', null, [
        node('nested-archived', 'artifact', '2026-01-01T00:00:00.000Z'),
      ]),
    ];

    const { active, archived } = partitionRegressionArchived(tree);
    expect(active.map((n) => n.id)).toEqual(['active', 'folder']);
    expect(archived.map((n) => n.id)).toEqual(['archived', 'nested-archived']);
  });
});

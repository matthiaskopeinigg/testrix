import type { RegressionSidebarFilter } from '@shared/config';

import type { RegressionTreeKind, RegressionTreeNode } from './regression-tree.types';

function resolveKind(node: RegressionTreeNode): RegressionTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'artifact') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'artifact';
}

function collectArtifacts(nodes: readonly RegressionTreeNode[]): RegressionTreeNode[] {
  const out: RegressionTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'artifact') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectArtifacts(node.children));
    }
  }
  return out;
}

/**
 * Restricts the regression tree to folders only, regressions only, or both.
 */
export function filterRegressionTreeByKind(
  nodes: readonly RegressionTreeNode[],
  filter: RegressionSidebarFilter,
): RegressionTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }

  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }

  return collectArtifacts(nodes);
}

import type { EnvironmentSidebarFilter } from '@shared/config';

import type { EnvironmentTreeKind, EnvironmentTreeNode } from './environment-tree.types';

function resolveKind(node: EnvironmentTreeNode): EnvironmentTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'variable') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'variable';
}

function collectVariables(nodes: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] {
  const out: EnvironmentTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'variable') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectVariables(node.children));
    }
  }
  return out;
}

/**
 * Restricts the tree to folders only, variables only, or both.
 */
export function filterEnvironmentTreeByKind(
  nodes: readonly EnvironmentTreeNode[],
  filter: EnvironmentSidebarFilter,
): EnvironmentTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }

  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }

  return collectVariables(nodes);
}

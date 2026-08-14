import type { LoadTestSidebarFilter } from '@shared/config';

import type { LoadTestTreeKind, LoadTestTreeNode } from './load-test-tree.types';

function resolveKind(node: LoadTestTreeNode): LoadTestTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'artifact') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'artifact';
}

function collectArtifacts(nodes: readonly LoadTestTreeNode[]): LoadTestTreeNode[] {
  const out: LoadTestTreeNode[] = [];
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
 * Restricts the load test tree to folders only, load tests only, or both.
 */
export function filterLoadTestTreeByKind(
  nodes: readonly LoadTestTreeNode[],
  filter: LoadTestSidebarFilter,
): LoadTestTreeNode[] {
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

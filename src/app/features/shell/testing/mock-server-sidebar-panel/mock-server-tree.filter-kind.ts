import type { MockServerSidebarFilter } from '@shared/config';

import type { MockServerTreeKind, MockServerTreeNode } from './mock-server-tree.types';

function resolveKind(node: MockServerTreeNode): MockServerTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'endpoint') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'endpoint';
}

function collectEndpoints(nodes: readonly MockServerTreeNode[]): MockServerTreeNode[] {
  const out: MockServerTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'endpoint') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectEndpoints(node.children));
    }
  }
  return out;
}

export function filterMockServerTreeByKind(
  nodes: readonly MockServerTreeNode[],
  filter: MockServerSidebarFilter,
): MockServerTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }
  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }
  return collectEndpoints(nodes);
}

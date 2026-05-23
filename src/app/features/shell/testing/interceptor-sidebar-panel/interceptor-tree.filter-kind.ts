import type { InterceptorSidebarFilter } from '@shared/config';

import type { InterceptorTreeKind, InterceptorTreeNode } from './interceptor-tree.types';

function resolveKind(node: InterceptorTreeNode): InterceptorTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'rule') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'rule';
}

function collectRules(nodes: readonly InterceptorTreeNode[]): InterceptorTreeNode[] {
  const out: InterceptorTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'rule') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectRules(node.children));
    }
  }
  return out;
}

/** Filters interceptor tree nodes by folder vs rule kind. */
export function filterInterceptorTreeByKind(
  nodes: readonly InterceptorTreeNode[],
  filter: InterceptorSidebarFilter,
): InterceptorTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }
  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }
  return collectRules(nodes);
}

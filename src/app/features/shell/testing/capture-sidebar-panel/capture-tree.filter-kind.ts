import type { CaptureSidebarFilter } from '@shared/config';

import type { CaptureTreeKind, CaptureTreeNode } from './capture-tree.types';

function resolveKind(node: CaptureTreeNode): CaptureTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'session') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'session';
}

function collectSessions(nodes: readonly CaptureTreeNode[]): CaptureTreeNode[] {
  const out: CaptureTreeNode[] = [];
  for (const node of nodes) {
    if (resolveKind(node) === 'session') {
      out.push(node);
      continue;
    }
    if (node.children?.length) {
      out.push(...collectSessions(node.children));
    }
  }
  return out;
}

export function filterCaptureTreeByKind(
  nodes: readonly CaptureTreeNode[],
  filter: CaptureSidebarFilter,
): CaptureTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }
  if (filter === 'folders') {
    return nodes
      .filter((node) => resolveKind(node) === 'folder')
      .map((node) => ({ ...node, children: undefined }));
  }
  return collectSessions(nodes);
}

import type { CaptureSidebarSortBy } from '@shared/config';

import type { CaptureTreeNode } from './capture-tree.types';

function compareNodes(a: CaptureTreeNode, b: CaptureTreeNode, sortBy: CaptureSidebarSortBy): number {
  if (sortBy === 'saved') {
    return 0;
  }
  if (sortBy === 'name-asc') {
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  }
  if (sortBy === 'name-desc') {
    return b.label.localeCompare(a.label, undefined, { sensitivity: 'base' });
  }
  const aTs = a.data?.updatedAt ?? '';
  const bTs = b.data?.updatedAt ?? '';
  if (sortBy === 'date-new') {
    return bTs.localeCompare(aTs);
  }
  return aTs.localeCompare(bTs);
}

function sortLevel(nodes: readonly CaptureTreeNode[], sortBy: CaptureSidebarSortBy): CaptureTreeNode[] {
  const folders = nodes.filter((n) => n.kind === 'folder' || n.data?.kind === 'folder');
  const sessions = nodes.filter((n) => n.kind === 'session' || n.data?.kind === 'session');
  const sortedFolders = [...folders]
    .map((node) => ({
      ...node,
      children: node.children ? sortLevel(node.children, sortBy) : undefined,
    }))
    .sort((a, b) => compareNodes(a, b, sortBy));
  const sortedSessions = [...sessions].sort((a, b) => compareNodes(a, b, sortBy));
  if (sortBy === 'saved') {
    return nodes.map((node) => ({
      ...node,
      children: node.children ? sortLevel(node.children, sortBy) : undefined,
    }));
  }
  return [...sortedFolders, ...sortedSessions];
}

export function sortCaptureTree(
  nodes: readonly CaptureTreeNode[],
  sortBy: CaptureSidebarSortBy,
): CaptureTreeNode[] {
  return sortLevel(nodes, sortBy);
}

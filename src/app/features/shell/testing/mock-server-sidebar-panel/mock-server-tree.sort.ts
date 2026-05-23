import type { MockServerSidebarSortBy } from '@shared/config';

import type { MockServerTreeKind, MockServerTreeNode } from './mock-server-tree.types';

function resolveKind(node: MockServerTreeNode): MockServerTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'endpoint') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'endpoint';
}

function compareLabels(a: MockServerTreeNode, b: MockServerTreeNode, direction: 'asc' | 'desc'): number {
  const cmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? cmp : -cmp;
}

function compareUpdatedAt(a: MockServerTreeNode, b: MockServerTreeNode, direction: 'new' | 'old'): number {
  const aTs = a.data?.updatedAt ?? '';
  const bTs = b.data?.updatedAt ?? '';
  const cmp = bTs.localeCompare(aTs);
  return direction === 'new' ? cmp : -cmp;
}

function sortSiblings(
  nodes: readonly MockServerTreeNode[],
  sortBy: MockServerSidebarSortBy,
): MockServerTreeNode[] {
  if (sortBy === 'saved') {
    return [...nodes];
  }
  const sorted = [...nodes];
  if (sortBy === 'name-asc') {
    sorted.sort((a, b) => compareLabels(a, b, 'asc'));
  } else if (sortBy === 'name-desc') {
    sorted.sort((a, b) => compareLabels(a, b, 'desc'));
  } else if (sortBy === 'date-new') {
    sorted.sort((a, b) => {
      const aFolder = resolveKind(a) === 'folder';
      const bFolder = resolveKind(b) === 'folder';
      if (aFolder !== bFolder) {
        return aFolder ? -1 : 1;
      }
      if (aFolder) {
        return compareLabels(a, b, 'asc');
      }
      return compareUpdatedAt(a, b, 'new');
    });
  } else if (sortBy === 'date-old') {
    sorted.sort((a, b) => {
      const aFolder = resolveKind(a) === 'folder';
      const bFolder = resolveKind(b) === 'folder';
      if (aFolder !== bFolder) {
        return aFolder ? -1 : 1;
      }
      if (aFolder) {
        return compareLabels(a, b, 'asc');
      }
      return compareUpdatedAt(a, b, 'old');
    });
  }
  return sorted;
}

export function sortMockServerTree(
  nodes: readonly MockServerTreeNode[],
  sortBy: MockServerSidebarSortBy,
): MockServerTreeNode[] {
  if (sortBy === 'saved') {
    return [...nodes];
  }
  return sortSiblings(nodes, sortBy).map((node) =>
    node.children?.length
      ? { ...node, children: sortMockServerTree(node.children, sortBy) }
      : node,
  );
}

import type { RegressionSidebarSortBy } from '@shared/config';

import type { RegressionTreeKind, RegressionTreeNode } from './regression-tree.types';

function resolveKind(node: RegressionTreeNode): RegressionTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'artifact') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'artifact';
}

function compareLabels(a: RegressionTreeNode, b: RegressionTreeNode, direction: 'asc' | 'desc'): number {
  const cmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? cmp : -cmp;
}

function compareUpdatedAt(a: RegressionTreeNode, b: RegressionTreeNode, direction: 'new' | 'old'): number {
  const aTs = a.data?.updatedAt ?? a.data?.createdAt ?? '';
  const bTs = b.data?.updatedAt ?? b.data?.createdAt ?? '';
  const cmp = bTs.localeCompare(aTs);
  return direction === 'new' ? cmp : -cmp;
}

function sortSiblings(
  nodes: readonly RegressionTreeNode[],
  sortBy: RegressionSidebarSortBy,
): RegressionTreeNode[] {
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

/**
 * Returns a copy of the tree with each sibling list sorted for sidebar presentation.
 */
export function sortRegressionTree(
  nodes: readonly RegressionTreeNode[],
  sortBy: RegressionSidebarSortBy,
): RegressionTreeNode[] {
  if (sortBy === 'saved') {
    return [...nodes];
  }

  return sortSiblings(nodes, sortBy).map((node) =>
    node.children?.length
      ? { ...node, children: sortRegressionTree(node.children, sortBy) }
      : node,
  );
}

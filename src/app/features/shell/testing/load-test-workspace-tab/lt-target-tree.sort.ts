import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

function compareNodeLabels(a: CollectionTreeNode, b: CollectionTreeNode): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function sortSiblingList(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  return [...nodes].sort(compareNodeLabels);
}

/** Returns a copy of the tree with each sibling list sorted by label. */
export function sortLtTargetTreeByName(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  return sortSiblingList(nodes).map((node) =>
    node.children?.length ? { ...node, children: sortLtTargetTreeByName(node.children) } : node,
  );
}

import type { CollectionTreeNode } from './collection-tree.types';

function compareNodeLabels(a: CollectionTreeNode, b: CollectionTreeNode): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

function sortSiblingList(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  return [...nodes].sort(compareNodeLabels);
}

/** Returns a copy of the tree with each sibling list sorted by label. */
export function sortCollectionTreeByName(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  return sortSiblingList(nodes).map((node) =>
    node.children?.length ? { ...node, children: sortCollectionTreeByName(node.children) } : node,
  );
}

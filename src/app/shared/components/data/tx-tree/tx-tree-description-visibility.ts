import type { TxTreeNode } from './tx-tree.types';

/**
 * Applies the sidebar "show descriptions" preference to tree nodes (strips `subtitle` when off).
 */
export function applyTreeDescriptionVisibility<TMeta>(
  nodes: readonly TxTreeNode<TMeta>[],
  showDescriptions: boolean,
): TxTreeNode<TMeta>[] {
  if (showDescriptions) {
    return [...nodes];
  }

  return nodes.map((node) => ({
    ...node,
    subtitle: undefined,
    children: node.children?.length
      ? applyTreeDescriptionVisibility(node.children, showDescriptions)
      : node.children,
  }));
}

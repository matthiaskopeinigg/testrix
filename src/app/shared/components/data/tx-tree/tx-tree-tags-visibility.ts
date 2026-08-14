import type { TxTreeNode } from './tx-tree.types';

/**
 * Applies the sidebar "show tags" preference to tree nodes (strips `tags` when off).
 */
export function applyTreeTagsVisibility<TMeta>(
  nodes: readonly TxTreeNode<TMeta>[],
  showTags: boolean,
): TxTreeNode<TMeta>[] {
  if (showTags) {
    return [...nodes];
  }

  return nodes.map((node) => ({
    ...node,
    tags: undefined,
    children: node.children?.length
      ? applyTreeTagsVisibility(node.children, showTags)
      : node.children,
  }));
}

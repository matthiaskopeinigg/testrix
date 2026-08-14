import type { CollectionTreeNode } from './collection-tree.types';

/**
 * Filters the collection tree by label (case-insensitive).
 * Keeps matching nodes and their ancestors.
 *
 * @param nodes - Root-level nodes.
 * @param query - Search string from the panel toolbar.
 */
export function filterCollectionTree(
  nodes: readonly CollectionTreeNode[],
  query: string,
): CollectionTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...nodes];
  }

  const filterList = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] => {
    const out: CollectionTreeNode[] = [];

    for (const node of list) {
      const desc = (node.data?.description ?? node.subtitle ?? '').toLowerCase();
      const labelMatch = node.label.toLowerCase().includes(needle) || desc.includes(needle);
      const filteredChildren = node.children?.length ? filterList(node.children) : [];
      const childMatch = filteredChildren.length > 0;

      if (labelMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? filteredChildren : labelMatch ? node.children : undefined,
        });
      }
    }

    return out;
  };

  return filterList(nodes);
}

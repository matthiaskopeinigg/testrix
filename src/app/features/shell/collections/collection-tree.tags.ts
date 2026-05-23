import type { CollectionTreeNode } from './collection-tree.types';

/** Collects unique tags from all collection tree nodes (sorted A–Z). */
export function collectAllCollectionTreeTags(nodes: readonly CollectionTreeNode[]): string[] {
  const tags = new Set<string>();

  const walk = (list: readonly CollectionTreeNode[]): void => {
    for (const node of list) {
      for (const tag of node.tags ?? []) {
        const trimmed = tag.trim();
        if (trimmed) {
          tags.add(trimmed);
        }
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Filters the tree to nodes that match any selected tag (keeps ancestor folders). */
export function filterCollectionTreeByTags(
  nodes: readonly CollectionTreeNode[],
  tagFilter: readonly string[],
): CollectionTreeNode[] {
  if (tagFilter.length === 0) {
    return [...nodes];
  }

  const wanted = new Set(tagFilter.map((tag) => tag.toLowerCase()));

  const filterNodes = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] => {
    const out: CollectionTreeNode[] = [];

    for (const node of list) {
      const tags = node.tags ?? [];
      const tagMatch = tags.some((tag) => wanted.has(tag.toLowerCase()));
      const filteredChildren = node.children?.length ? filterNodes(node.children) : [];
      const childMatch = filteredChildren.length > 0;

      if (tagMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? filteredChildren : tagMatch ? node.children : undefined,
        });
      }
    }

    return out;
  };

  return filterNodes(nodes);
}

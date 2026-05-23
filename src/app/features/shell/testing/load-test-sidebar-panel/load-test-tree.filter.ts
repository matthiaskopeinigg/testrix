import type { LoadTestTreeNode } from './load-test-tree.types';

/** Collects all folder ids in the tree. */
export function collectLoadTestFolderIds(nodes: readonly LoadTestTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectLoadTestFolderIds(node.children));
    }
  }
  return ids;
}

/** Collects folder ids within a subtree (for search expand-all). */
export function collectLoadTestFolderIdsInSubtree(nodes: readonly LoadTestTreeNode[]): string[] {
  return collectLoadTestFolderIds(nodes);
}

/** Filters load test tree nodes by search query (label + description), keeping ancestor folders. */
export function filterLoadTestTree(
  nodes: readonly LoadTestTreeNode[],
  query: string,
): LoadTestTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly LoadTestTreeNode[]): LoadTestTreeNode[] => {
    const out: LoadTestTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const descMatch = (node.data?.description ?? node.subtitle ?? '').toLowerCase().includes(q);
      const tagMatch = (node.data?.tags ?? node.tags ?? []).some((tag) =>
        tag.toLowerCase().includes(q),
      );
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;

      if (labelMatch || descMatch || tagMatch || childMatch) {
        out.push({
          ...node,
          children: children?.length ? children : node.children && childMatch ? children : undefined,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

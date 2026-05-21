import type { CollectionTreeNode } from './collection-tree.types';

/**
 * Collects ids of all folder nodes in the tree (for expand-all).
 *
 * @param nodes - Root-level collection nodes.
 */
export function collectFolderIds(nodes: readonly CollectionTreeNode[]): string[] {
  const ids: string[] = [];

  const walk = (list: readonly CollectionTreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'folder') {
        ids.push(node.id);
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return ids;
}

/**
 * Collects folder ids present in a (possibly filtered) subtree.
 *
 * @param nodes - Root-level nodes to scan.
 */
export function collectFolderIdsInSubtree(nodes: readonly CollectionTreeNode[]): string[] {
  return collectFolderIds(nodes);
}

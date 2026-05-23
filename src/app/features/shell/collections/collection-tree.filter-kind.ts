import type { CollectionTreeKind, CollectionTreeNode } from './collection-tree.types';

function resolveKind(node: CollectionTreeNode): CollectionTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'request' || node.data?.kind === 'websocket') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'request';
}

function filterListByKind(
  list: readonly CollectionTreeNode[],
  keepKind: CollectionTreeKind,
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];

  for (const node of list) {
    const kind = resolveKind(node);
    const filteredChildren = node.children?.length ? filterListByKind(node.children, keepKind) : [];
    const childMatch = filteredChildren.length > 0;

    if (kind === keepKind) {
      out.push({
        ...node,
        children: kind === 'folder' ? (childMatch ? filteredChildren : undefined) : undefined,
      });
      continue;
    }

    if (kind === 'folder' && childMatch) {
      out.push({
        ...node,
        children: filteredChildren,
      });
    }
  }

  return out;
}

/** Restricts the tree to nodes of a single kind (folders keep ancestors). */
export function filterCollectionTreeByKind(
  nodes: readonly CollectionTreeNode[],
  kind: CollectionTreeKind,
): CollectionTreeNode[] {
  return filterListByKind(nodes, kind);
}

/** Keeps favourite nodes and ancestor folders required to reach them. */
export function filterCollectionTreeFavourites(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  const filterList = (list: readonly CollectionTreeNode[]): CollectionTreeNode[] => {
    const out: CollectionTreeNode[] = [];

    for (const node of list) {
      const filteredChildren = node.children?.length ? filterList(node.children) : [];
      const childMatch = filteredChildren.length > 0;
      const selfMatch = node.favourite === true;

      if (selfMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? filteredChildren : selfMatch ? node.children : undefined,
        });
      }
    }

    return out;
  };

  return filterList(nodes);
}

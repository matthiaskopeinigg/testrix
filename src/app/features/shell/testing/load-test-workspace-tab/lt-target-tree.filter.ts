import type { CollectionTreeKind, CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

import type { LtTargetTreeFilter } from './lt-target-tree.types';

function resolveKind(node: CollectionTreeNode): CollectionTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'request' || node.data?.kind === 'websocket') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'request';
}

/** Removes websocket nodes from the collection tree. */
export function stripWebsocketCollectionNodes(
  nodes: readonly CollectionTreeNode[],
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];

  for (const node of nodes) {
    const kind = resolveKind(node);
    if (kind === 'websocket') {
      continue;
    }

    const children = node.children?.length
      ? stripWebsocketCollectionNodes(node.children)
      : undefined;

    if (kind === 'folder' && (!children || children.length === 0)) {
      continue;
    }

    out.push({
      ...node,
      children,
    });
  }

  return out;
}

/** Filters the target tree by label, description, method, and URL. */
export function filterLtTargetTree(
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
      const method = (node.data?.method ?? '').toLowerCase();
      const url = (node.data?.url ?? '').toLowerCase();
      const labelMatch =
        node.label.toLowerCase().includes(needle) ||
        desc.includes(needle) ||
        method.includes(needle) ||
        url.includes(needle);
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

/** Returns a flat list of HTTP request nodes. */
export function collectLtTargetRequestNodes(
  nodes: readonly CollectionTreeNode[],
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];

  const walk = (list: readonly CollectionTreeNode[]): void => {
    for (const node of list) {
      const kind = resolveKind(node);
      if (kind === 'request') {
        out.push({ ...node, children: undefined });
        continue;
      }
      if (kind === 'folder' && node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return out;
}

/** Restricts the tree to folders + requests or requests only. */
export function filterLtTargetTreeByKind(
  nodes: readonly CollectionTreeNode[],
  filter: LtTargetTreeFilter,
): CollectionTreeNode[] {
  if (filter === 'all') {
    return [...nodes];
  }
  return collectLtTargetRequestNodes(nodes);
}

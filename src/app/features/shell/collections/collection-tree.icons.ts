import type { TxIconName } from '@app/shared/icons';

import type { CollectionTreeKind, CollectionTreeNode } from './collection-tree.types';

const COLLECTION_KIND_ICONS: Record<CollectionTreeKind, TxIconName> = {
  folder: 'folder',
  request: 'http',
  websocket: 'zap',
};

/**
 * Returns the default icon for a collection tree node kind.
 *
 * @param kind - Folder, HTTP request, or WebSocket entry.
 */
export function iconForCollectionKind(kind: CollectionTreeKind): TxIconName {
  return COLLECTION_KIND_ICONS[kind];
}

function resolveCollectionTreeKind(node: CollectionTreeNode): CollectionTreeKind {
  const kind = node.data?.kind ?? node.kind;
  if (kind === 'request' || kind === 'websocket') {
    return kind;
  }
  return 'folder';
}

function applyCollectionTreeIconsToNode(node: CollectionTreeNode): CollectionTreeNode {
  const icon = iconForCollectionKind(resolveCollectionTreeKind(node));
  let children = node.children;
  if (children?.length) {
    const nextChildren = children.map((child) => applyCollectionTreeIconsToNode(child));
    if (nextChildren.some((child, index) => child !== children![index])) {
      children = nextChildren;
    }
  }
  if (node.icon === icon && children === node.children) {
    return node;
  }
  return { ...node, icon, children };
}

/** Ensures every tree node has the icon for its kind (folders → folder, requests → http). */
export function withCollectionTreeIcons(nodes: readonly CollectionTreeNode[]): CollectionTreeNode[] {
  let changed = false;
  const mapped = nodes.map((node) => {
    const next = applyCollectionTreeIconsToNode(node);
    if (next !== node) {
      changed = true;
    }
    return next;
  });
  return changed ? mapped : (nodes as CollectionTreeNode[]);
}

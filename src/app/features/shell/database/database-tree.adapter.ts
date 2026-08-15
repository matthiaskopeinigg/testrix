import {
  isSavedDatabaseQuery,
  type SavedQueryTreeItem,
} from '@shared/database';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { DatabaseTreeKind, DatabaseTreeNode } from './database-tree.types';

function iconForKind(kind: DatabaseTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'database';
}

/** Maps persisted query tree items to tx-tree nodes. */
export function toDatabaseTreeNodes(fileItems: readonly SavedQueryTreeItem[]): DatabaseTreeNode[] {
  return fileItems.map(toDatabaseTreeNode);
}

function toDatabaseTreeNode(item: SavedQueryTreeItem): DatabaseTreeNode {
  if (isSavedDatabaseQuery(item)) {
    return {
      id: item.id,
      label: item.name,
      kind: 'query',
      icon: iconForKind('query'),
      data: {
        kind: 'query',
        connectionId: item.connectionId,
        query: item.query,
        updatedAt: item.updatedAt,
      },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder', updatedAt: item.updatedAt },
    children: item.children.map(toDatabaseTreeNode),
  };
}

/** Merges tree structure with existing persisted items. */
export function fromDatabaseTreeNodesWithExisting(
  treeNodes: readonly DatabaseTreeNode[],
  existingItems: readonly SavedQueryTreeItem[],
): SavedQueryTreeItem[] {
  const existingById = new Map<string, SavedQueryTreeItem>();
  const indexExisting = (items: readonly SavedQueryTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isSavedDatabaseQuery(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromDatabaseTreeNode(node, existingById.get(node.id)));
}

function fromDatabaseTreeNode(node: DatabaseTreeNode, existing?: SavedQueryTreeItem): SavedQueryTreeItem {
  const kind = node.data?.kind ?? (node.kind as DatabaseTreeKind | undefined) ?? 'query';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isSavedDatabaseQuery(existing) ? existing : null;
    return {
      id: node.id,
      kind: 'folder',
      name: node.label,
      children: (node.children ?? []).map((child) => {
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromDatabaseTreeNode(child, prevById);
      }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isSavedDatabaseQuery(existing) ? existing : null;
  return {
    id: node.id,
    kind: 'query',
    name: node.label,
    connectionId: prev?.connectionId ?? (node.data?.kind === 'query' ? (node.data.connectionId ?? '') : ''),
    query: prev?.query ?? (node.data?.kind === 'query' ? (node.data.query ?? '') : ''),
    updatedAt: prev?.updatedAt ?? ts,
    readOnly: prev?.readOnly,
  };
}

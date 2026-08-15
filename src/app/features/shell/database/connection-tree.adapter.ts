import {
  createDefaultDatabaseConnection,
  isDatabaseConnectionLeaf,
  type DatabaseConnection,
  type DatabaseConnectionTreeItem,
} from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { ConnectionTreeKind, ConnectionTreeNode } from './connection-tree.types';

function iconForKind(kind: ConnectionTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'database';
}

function connectionSubtitle(conn: DatabaseConnection): string {
  if (conn.type === 'sqlite') {
    return conn.filePath || 'SQLite';
  }
  return `${conn.host || 'localhost'}${conn.port ? `:${conn.port}` : ''}`;
}

/** Maps persisted connection tree items to tx-tree nodes. */
export function toConnectionTreeNodes(
  fileItems: readonly DatabaseConnectionTreeItem[],
): ConnectionTreeNode[] {
  return fileItems.map(toConnectionTreeNode);
}

function toConnectionTreeNode(item: DatabaseConnectionTreeItem): ConnectionTreeNode {
  if (isDatabaseConnectionLeaf(item)) {
    return {
      id: item.id,
      label: item.name,
      kind: 'connection',
      icon: iconForKind('connection'),
      subtitle: connectionSubtitle(item),
      data: {
        kind: 'connection',
        type: item.type,
        host: item.host,
        port: item.port,
        filePath: item.filePath,
      },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder', updatedAt: item.updatedAt },
    children: item.children.map(toConnectionTreeNode),
  };
}

/** Merges tree structure with existing persisted items. */
export function fromConnectionTreeNodesWithExisting(
  treeNodes: readonly ConnectionTreeNode[],
  existingItems: readonly DatabaseConnectionTreeItem[],
): DatabaseConnectionTreeItem[] {
  const existingById = new Map<string, DatabaseConnectionTreeItem>();
  const indexExisting = (items: readonly DatabaseConnectionTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isDatabaseConnectionLeaf(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes
    .filter((node) => {
      const kind = node.data?.kind ?? node.kind;
      return kind === 'folder' || kind === 'connection';
    })
    .map((node) => fromConnectionTreeNode(node, existingById.get(node.id)));
}

function fromConnectionTreeNode(
  node: ConnectionTreeNode,
  existing?: DatabaseConnectionTreeItem,
): DatabaseConnectionTreeItem {
  const kind = node.data?.kind ?? (node.kind as ConnectionTreeKind | undefined) ?? 'connection';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isDatabaseConnectionLeaf(existing) ? existing : null;
    return {
      id: node.id,
      kind: 'folder',
      name: node.label,
      children: (node.children ?? [])
        .filter((child) => isPersistableConnectionNode(child))
        .map((child) => {
          const prevById = prev?.children.find((c) => c.id === child.id);
          return fromConnectionTreeNode(child, prevById);
        }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isDatabaseConnectionLeaf(existing) ? existing : null;
  if (prev) {
    return { ...prev, name: node.label, kind: 'connection' };
  }
  const created = createDefaultDatabaseConnection(
    node.data?.kind === 'connection' ? (node.data.type ?? 'postgresql') : 'postgresql',
    node.id,
  );
  return { ...created, name: node.label, kind: 'connection' };
}

function isPersistableConnectionNode(node: ConnectionTreeNode): boolean {
  const kind = node.data?.kind ?? node.kind;
  return kind === 'folder' || kind === 'connection';
}

import { newTestingId } from '@app/core/testing/testing-id';

import type { ConnectionTreeKind, ConnectionTreeNode } from './connection-tree.types';

export interface ConnectionNodeLocation {
  readonly node: ConnectionTreeNode;
  readonly parent: ConnectionTreeNode | null;
  readonly siblings: ConnectionTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested connection tree. */
export function findConnectionNode(
  nodes: readonly ConnectionTreeNode[],
  id: string,
  parent: ConnectionTreeNode | null = null,
): ConnectionNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findConnectionNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isConnectionLeafNode(node: ConnectionTreeNode): boolean {
  return node.data?.kind === 'connection' || node.kind === 'connection';
}

export function isConnectionFolderNode(node: ConnectionTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

function cloneNodes(nodes: readonly ConnectionTreeNode[]): ConnectionTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: ConnectionTreeKind, label?: string): ConnectionTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New connection');
  if (kind === 'folder') {
    return {
      id,
      label: resolvedLabel,
      kind: 'folder',
      icon: 'folder',
      data: { kind: 'folder' },
      children: [],
    };
  }
  return {
    id,
    label: resolvedLabel,
    kind: 'connection',
    icon: 'database',
    data: { kind: 'connection', type: 'postgresql' },
  };
}

function insertIntoParent(
  nodes: ConnectionTreeNode[],
  parentId: string | null,
  child: ConnectionTreeNode,
): ConnectionTreeNode[] {
  if (parentId === null) {
    return [...nodes, child];
  }
  return nodes.map((node) => {
    if (node.id === parentId && isConnectionFolderNode(node)) {
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (node.children?.length) {
      return { ...node, children: insertIntoParent([...node.children], parentId, child) };
    }
    return node;
  });
}

function mapNode(
  nodes: ConnectionTreeNode[],
  nodeId: string,
  update: (node: ConnectionTreeNode) => ConnectionTreeNode,
): ConnectionTreeNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return update(node);
    }
    if (node.children?.length) {
      return { ...node, children: mapNode([...node.children], nodeId, update) };
    }
    return node;
  });
}

/** Inserts a folder or connection under optional parent. */
export function createConnectionTreeNode(
  nodes: readonly ConnectionTreeNode[],
  parentId: string | null,
  kind: ConnectionTreeKind,
  label?: string,
): { readonly nodes: ConnectionTreeNode[]; readonly nodeId: string } | null {
  if (parentId) {
    const loc = findConnectionNode(nodes, parentId);
    if (!loc || !isConnectionFolderNode(loc.node)) {
      return null;
    }
  }
  const node = createNode(kind, label);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, node),
    nodeId: node.id,
  };
}

export function renameConnectionTreeNode(
  nodes: readonly ConnectionTreeNode[],
  nodeId: string,
  label: string,
): ConnectionTreeNode[] | null {
  if (!findConnectionNode(nodes, nodeId)) {
    return null;
  }
  const trimmed = label.trim();
  return mapNode(cloneNodes(nodes), nodeId, (node) => ({
    ...node,
    label: trimmed || node.label,
  }));
}

export function deleteConnectionTreeNode(
  nodes: readonly ConnectionTreeNode[],
  nodeId: string,
): ConnectionTreeNode[] | null {
  const remove = (list: ConnectionTreeNode[]): ConnectionTreeNode[] | null => {
    const index = list.findIndex((n) => n.id === nodeId);
    if (index >= 0) {
      return [...list.slice(0, index), ...list.slice(index + 1)];
    }
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.children?.length) {
        const childNext = remove([...(node.children ?? [])]);
        if (childNext) {
          const copy = cloneNodes(list);
          copy[i] = { ...copy[i], children: childNext };
          return copy;
        }
      }
    }
    return null;
  };
  return remove(cloneNodes(nodes));
}

/** Collects connection ids that a delete of `rootId` would remove. */
export function collectConnectionIdsForDeletion(
  nodes: readonly ConnectionTreeNode[],
  rootId: string,
): string[] {
  const loc = findConnectionNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: ConnectionTreeNode): void => {
    if (isConnectionLeafNode(node)) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

export function connectionFolderHasChildren(
  nodes: readonly ConnectionTreeNode[],
  folderId: string,
): boolean {
  const loc = findConnectionNode(nodes, folderId);
  return Boolean(loc?.node.children?.length);
}

export function collectConnectionFolderIdsFromNodes(nodes: readonly ConnectionTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (isConnectionFolderNode(node)) {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectConnectionFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

export function collectConnectionExpandableIds(nodes: readonly ConnectionTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly ConnectionTreeNode[]): void => {
    for (const node of list) {
      const kind = node.data?.kind ?? node.kind;
      if (
        kind === 'folder' ||
        kind === 'connection' ||
        kind === 'schema' ||
        kind === 'group' ||
        kind === 'table' ||
        kind === 'view'
      ) {
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

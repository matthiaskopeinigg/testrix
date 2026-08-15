import { newTestingId } from '@app/core/testing/testing-id';

import type { DatabaseTreeKind, DatabaseTreeNode } from './database-tree.types';

export interface DatabaseNodeLocation {
  readonly node: DatabaseTreeNode;
  readonly parent: DatabaseTreeNode | null;
  readonly siblings: DatabaseTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findDatabaseNode(
  nodes: readonly DatabaseTreeNode[],
  id: string,
  parent: DatabaseTreeNode | null = null,
): DatabaseNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findDatabaseNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isDatabaseQueryNode(node: DatabaseTreeNode): boolean {
  return node.data?.kind === 'query' || node.kind === 'query';
}

export function isDatabaseFolderNode(node: DatabaseTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

function cloneNodes(nodes: readonly DatabaseTreeNode[]): DatabaseTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: DatabaseTreeKind, label?: string): DatabaseTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New query');
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
    kind: 'query',
    icon: 'database',
    data: { kind: 'query', connectionId: '', query: '' },
  };
}

function insertIntoParent(
  nodes: DatabaseTreeNode[],
  parentId: string | null,
  child: DatabaseTreeNode,
): DatabaseTreeNode[] {
  if (parentId === null) {
    return [...nodes, child];
  }
  return nodes.map((node) => {
    if (node.id === parentId && isDatabaseFolderNode(node)) {
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (node.children?.length) {
      return { ...node, children: insertIntoParent([...node.children], parentId, child) };
    }
    return node;
  });
}

function mapNode(
  nodes: DatabaseTreeNode[],
  nodeId: string,
  update: (node: DatabaseTreeNode) => DatabaseTreeNode,
): DatabaseTreeNode[] {
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

/** Inserts a folder or query under optional parent. */
export function createDatabaseNode(
  nodes: readonly DatabaseTreeNode[],
  parentId: string | null,
  kind: DatabaseTreeKind,
  label?: string,
): { readonly nodes: DatabaseTreeNode[]; readonly nodeId: string } | null {
  if (parentId) {
    const loc = findDatabaseNode(nodes, parentId);
    if (!loc || !isDatabaseFolderNode(loc.node)) {
      return null;
    }
  }
  const node = createNode(kind, label);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, node),
    nodeId: node.id,
  };
}

export function renameDatabaseNode(
  nodes: readonly DatabaseTreeNode[],
  nodeId: string,
  label: string,
): DatabaseTreeNode[] | null {
  if (!findDatabaseNode(nodes, nodeId)) {
    return null;
  }
  const trimmed = label.trim();
  return mapNode(cloneNodes(nodes), nodeId, (node) => ({
    ...node,
    label: trimmed || node.label,
  }));
}

export function deleteDatabaseNode(
  nodes: readonly DatabaseTreeNode[],
  nodeId: string,
): DatabaseTreeNode[] | null {
  const remove = (list: DatabaseTreeNode[]): DatabaseTreeNode[] | null => {
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

export function collectDatabaseQueryIdsForDeletion(
  nodes: readonly DatabaseTreeNode[],
  rootId: string,
): string[] {
  const loc = findDatabaseNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: DatabaseTreeNode): void => {
    if (isDatabaseQueryNode(node)) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

export function databaseFolderHasChildren(
  nodes: readonly DatabaseTreeNode[],
  folderId: string,
): boolean {
  const loc = findDatabaseNode(nodes, folderId);
  return Boolean(loc?.node.children?.length);
}

export function collectDatabaseFolderIdsFromNodes(nodes: readonly DatabaseTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (isDatabaseFolderNode(node)) {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectDatabaseFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

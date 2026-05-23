import { newTestingId } from '@app/core/testing/testing-id';

import type { InterceptorTreeKind, InterceptorTreeNode } from './interceptor-tree.types';

export interface InterceptorNodeLocation {
  readonly node: InterceptorTreeNode;
  readonly parent: InterceptorTreeNode | null;
  readonly siblings: InterceptorTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findInterceptorNode(
  nodes: readonly InterceptorTreeNode[],
  id: string,
  parent: InterceptorTreeNode | null = null,
): InterceptorNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findInterceptorNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isInterceptorRuleNode(node: InterceptorTreeNode): boolean {
  return node.data?.kind === 'rule' || node.kind === 'rule';
}

export function isInterceptorFolderNode(node: InterceptorTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

function cloneNodes(nodes: readonly InterceptorTreeNode[]): InterceptorTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: InterceptorTreeKind, label?: string): InterceptorTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New rule');
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
    kind: 'rule',
    icon: 'interceptor',
    data: { kind: 'rule', matchUrl: '*', enabled: true },
  };
}

/** Inserts a folder or rule under optional parent. */
export function createInterceptorNode(
  nodes: readonly InterceptorTreeNode[],
  parentId: string | null,
  kind: InterceptorTreeKind,
  label?: string,
): { readonly nodes: InterceptorTreeNode[]; readonly nodeId: string } | null {
  const next = cloneNodes(nodes);
  const node = createNode(kind, label);
  if (!parentId) {
    return { nodes: [...next, node], nodeId: node.id };
  }
  const loc = findInterceptorNode(next, parentId);
  if (!loc || !isInterceptorFolderNode(loc.node)) {
    return null;
  }
  const children = [...(loc.node.children ?? []), node];
  loc.siblings[loc.index] = { ...loc.node, children };
  return { nodes: next, nodeId: node.id };
}

export function renameInterceptorNode(
  nodes: readonly InterceptorTreeNode[],
  nodeId: string,
  label: string,
): InterceptorTreeNode[] | null {
  const loc = findInterceptorNode(nodes, nodeId);
  if (!loc) {
    return null;
  }
  const next = cloneNodes(nodes);
  const updated = findInterceptorNode(next, nodeId);
  if (!updated) {
    return null;
  }
  updated.siblings[updated.index] = { ...updated.node, label: label.trim() || updated.node.label };
  return next;
}

export function deleteInterceptorNode(
  nodes: readonly InterceptorTreeNode[],
  nodeId: string,
): InterceptorTreeNode[] | null {
  const remove = (list: InterceptorTreeNode[]): InterceptorTreeNode[] | null => {
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

export function collectInterceptorRuleIdsForDeletion(
  nodes: readonly InterceptorTreeNode[],
  rootId: string,
): string[] {
  const loc = findInterceptorNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: InterceptorTreeNode): void => {
    if (isInterceptorRuleNode(node)) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

export function interceptorFolderHasChildren(
  nodes: readonly InterceptorTreeNode[],
  folderId: string,
): boolean {
  const loc = findInterceptorNode(nodes, folderId);
  return Boolean(loc?.node.children?.length);
}

export function collectInterceptorFolderIdsFromNodes(nodes: readonly InterceptorTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (isInterceptorFolderNode(node)) {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectInterceptorFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

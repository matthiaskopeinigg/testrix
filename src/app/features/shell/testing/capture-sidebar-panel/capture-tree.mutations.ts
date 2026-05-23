import { newTestingId } from '@app/core/testing/testing-id';

import type { CaptureTreeKind, CaptureTreeNode } from './capture-tree.types';

export interface CaptureNodeLocation {
  readonly node: CaptureTreeNode;
  readonly parent: CaptureTreeNode | null;
  readonly siblings: CaptureTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findCaptureNode(
  nodes: readonly CaptureTreeNode[],
  id: string,
  parent: CaptureTreeNode | null = null,
): CaptureNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findCaptureNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isCaptureSessionNode(node: CaptureTreeNode): boolean {
  return node.data?.kind === 'session' || node.kind === 'session';
}

export function isCaptureFolderNode(node: CaptureTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

function cloneNodes(nodes: readonly CaptureTreeNode[]): CaptureTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: CaptureTreeKind, label?: string): CaptureTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New capture');
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
    kind: 'session',
    icon: 'globe',
    data: { kind: 'session', startUrl: 'https://example.com' },
  };
}

/** Inserts a folder or session under optional parent. */
export function createCaptureNode(
  nodes: readonly CaptureTreeNode[],
  parentId: string | null,
  kind: CaptureTreeKind,
  label?: string,
): { readonly nodes: CaptureTreeNode[]; readonly nodeId: string } | null {
  const next = cloneNodes(nodes);
  const node = createNode(kind, label);
  if (!parentId) {
    return { nodes: [...next, node], nodeId: node.id };
  }
  const loc = findCaptureNode(next, parentId);
  if (!loc || !isCaptureFolderNode(loc.node)) {
    return null;
  }
  const children = [...(loc.node.children ?? []), node];
  loc.siblings[loc.index] = { ...loc.node, children };
  return { nodes: next, nodeId: node.id };
}

export function renameCaptureNode(
  nodes: readonly CaptureTreeNode[],
  nodeId: string,
  label: string,
): CaptureTreeNode[] | null {
  const loc = findCaptureNode(nodes, nodeId);
  if (!loc) {
    return null;
  }
  const next = cloneNodes(nodes);
  const updated = findCaptureNode(next, nodeId);
  if (!updated) {
    return null;
  }
  updated.siblings[updated.index] = { ...updated.node, label: label.trim() || updated.node.label };
  return next;
}

export function deleteCaptureNode(
  nodes: readonly CaptureTreeNode[],
  nodeId: string,
): CaptureTreeNode[] | null {
  const remove = (list: CaptureTreeNode[]): CaptureTreeNode[] | null => {
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

export function collectCaptureSessionIdsForDeletion(
  nodes: readonly CaptureTreeNode[],
  rootId: string,
): string[] {
  const loc = findCaptureNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: CaptureTreeNode): void => {
    if (isCaptureSessionNode(node)) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

export function captureFolderHasChildren(
  nodes: readonly CaptureTreeNode[],
  folderId: string,
): boolean {
  const loc = findCaptureNode(nodes, folderId);
  return Boolean(loc?.node.children?.length);
}

export function collectCaptureFolderIdsFromNodes(nodes: readonly CaptureTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (isCaptureFolderNode(node)) {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectCaptureFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

import { HTTP_METHOD_IDS } from '@shared/config/http-settings.schema';
import {
  createDefaultMockRuleMatcher,
  createDefaultMockServerEndpoint,
  type MockServerEndpoint,
  type MockServerMismatchRecord,
} from '@shared/testing';

import { newTestingId } from '@app/core/testing/testing-id';

import type { MockServerTreeKind, MockServerTreeNode } from './mock-server-tree.types';

export interface MockServerNodeLocation {
  readonly node: MockServerTreeNode;
  readonly parent: MockServerTreeNode | null;
  readonly siblings: MockServerTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findMockServerNode(
  nodes: readonly MockServerTreeNode[],
  id: string,
  parent: MockServerTreeNode | null = null,
): MockServerNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findMockServerNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function isMockServerEndpointNode(node: MockServerTreeNode): boolean {
  return node.data?.kind === 'endpoint' || node.kind === 'endpoint';
}

export function isMockServerFolderNode(node: MockServerTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

function cloneNodes(nodes: readonly MockServerTreeNode[]): MockServerTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: MockServerTreeKind, label?: string): MockServerTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New endpoint');
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
    kind: 'endpoint',
    icon: 'api',
    data: { kind: 'endpoint', description: '', enabled: true },
  };
}

/** Inserts a folder or endpoint under optional parent. */
export function createMockServerNode(
  nodes: readonly MockServerTreeNode[],
  parentId: string | null,
  kind: MockServerTreeKind,
  label?: string,
): { readonly nodes: MockServerTreeNode[]; readonly nodeId: string } | null {
  const next = cloneNodes(nodes);
  const node = createNode(kind, label);
  if (!parentId) {
    return { nodes: [...next, node], nodeId: node.id };
  }
  const loc = findMockServerNode(next, parentId);
  if (!loc || !isMockServerFolderNode(loc.node)) {
    return null;
  }
  const children = [...(loc.node.children ?? []), node];
  loc.siblings[loc.index] = { ...loc.node, children };
  return { nodes: next, nodeId: node.id };
}

export function renameMockServerNode(
  nodes: readonly MockServerTreeNode[],
  nodeId: string,
  label: string,
): MockServerTreeNode[] | null {
  const loc = findMockServerNode(nodes, nodeId);
  if (!loc) {
    return null;
  }
  const next = cloneNodes(nodes);
  const updated = findMockServerNode(next, nodeId);
  if (!updated) {
    return null;
  }
  updated.siblings[updated.index] = { ...updated.node, label: label.trim() || updated.node.label };
  return next;
}

export function deleteMockServerNode(
  nodes: readonly MockServerTreeNode[],
  nodeId: string,
): MockServerTreeNode[] | null {
  const remove = (list: MockServerTreeNode[]): MockServerTreeNode[] | null => {
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

export function collectMockServerEndpointIdsForDeletion(
  nodes: readonly MockServerTreeNode[],
  rootId: string,
): string[] {
  const loc = findMockServerNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: MockServerTreeNode): void => {
    if (isMockServerEndpointNode(node)) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

/** Whether a folder node has child rows in the tree. */
export function mockServerFolderHasChildren(
  nodes: readonly MockServerTreeNode[],
  folderId: string,
): boolean {
  const loc = findMockServerNode(nodes, folderId);
  return Boolean(loc?.node.children?.length);
}

export function collectMockServerFolderIdsFromNodes(nodes: readonly MockServerTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (isMockServerFolderNode(node)) {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectMockServerFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

/**
 * Builds a new endpoint prefilled from an unmatched request record.
 */
export function createEndpointFromMismatch(
  mismatch: MockServerMismatchRecord,
  name?: string,
): MockServerEndpoint {
  const ts = new Date().toISOString();
  const id = newTestingId();
  const endpoint = createDefaultMockServerEndpoint(id, name ?? `${mismatch.method} ${mismatch.pathname}`, ts);
  const method = HTTP_METHOD_IDS.find((m) => m === mismatch.method);
  const matcher = createDefaultMockRuleMatcher(`${id}-matcher`);
  return {
    ...endpoint,
    matchers: [
      {
        ...matcher,
        methods: method ? [method] : [],
        path: { mode: 'exact', value: mismatch.pathname, ignoreQuery: false },
      },
    ],
  };
}

import type { LoadTestArtifact, LoadTestTreeItem } from '@shared/testing';
import {
  createDefaultLoadTestManualTarget,
  createDefaultLoadTestProfile,
  createDefaultLoadTestThresholds,
} from '@shared/testing';

import { newTestingId } from '@app/core/testing/testing-id';

import type { LoadTestTreeKind, LoadTestTreeNode } from './load-test-tree.types';

function isArtifact(item: LoadTestTreeItem): item is LoadTestArtifact {
  return 'profile' in item;
}

export interface LoadTestNodeLocation {
  readonly node: LoadTestTreeNode;
  readonly parent: LoadTestTreeNode | null;
  readonly siblings: LoadTestTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findLoadTestNode(
  nodes: readonly LoadTestTreeNode[],
  id: string,
  parent: LoadTestTreeNode | null = null,
): LoadTestNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findLoadTestNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Returns true when a load test folder has at least one child node. */
export function loadTestFolderHasChildren(
  nodes: readonly LoadTestTreeNode[],
  folderId: string,
): boolean {
  const loc = findLoadTestNode(nodes, folderId);
  return !!loc?.node.children?.length;
}

/** Collects folder ids in subtree (for session prune). */
export function collectLoadTestFolderIdsFromNodes(nodes: readonly LoadTestTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectLoadTestFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

/** Collects artifact ids in subtree for tab cleanup on delete. */
export function collectLoadTestArtifactIdsForDeletion(
  nodes: readonly LoadTestTreeNode[],
  rootId: string,
): string[] {
  const loc = findLoadTestNode(nodes, rootId);
  if (!loc) {
    return [];
  }

  const ids: string[] = [];
  const walk = (node: LoadTestTreeNode): void => {
    if (node.data?.kind === 'artifact' || node.kind === 'artifact') {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

/** Collects ids of the target node and all descendants (for scoped export). */
export function collectLoadTestNodeIdsInSubtree(
  nodes: readonly LoadTestTreeNode[],
  rootId: string,
): readonly string[] {
  const loc = findLoadTestNode(nodes, rootId);
  if (!loc) {
    return [rootId];
  }

  const ids: string[] = [];
  const walk = (node: LoadTestTreeNode): void => {
    ids.push(node.id);
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

function cloneNodes(nodes: readonly LoadTestTreeNode[]): LoadTestTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: LoadTestTreeKind, label?: string): LoadTestTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New load test');

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
    kind: 'artifact',
    icon: 'zap',
    data: { kind: 'artifact', description: '' },
  };
}

function insertIntoParent(
  nodes: LoadTestTreeNode[],
  parentId: string | null,
  child: LoadTestTreeNode,
): LoadTestTreeNode[] {
  if (parentId === null) {
    return [...nodes, child];
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? []), child];
      return { ...node, children };
    }
    if (node.children?.length) {
      return { ...node, children: insertIntoParent([...node.children], parentId, child) };
    }
    return node;
  });
}

/** Returns true when a folder can be created under the given parent (root only). */
export function canCreateLoadTestFolder(parentId: string | null): boolean {
  return parentId === null;
}

/** Creates a folder or artifact under `parentId` (null = root). Folders only at root. */
export function createLoadTestNode(
  nodes: readonly LoadTestTreeNode[],
  parentId: string | null,
  kind: LoadTestTreeKind,
  label?: string,
): { nodes: LoadTestTreeNode[]; nodeId: string } | null {
  if (kind === 'folder' && !canCreateLoadTestFolder(parentId)) {
    return null;
  }

  if (parentId !== null) {
    const parent = findLoadTestNode(nodes, parentId);
    if (!parent || parent.node.data?.kind !== 'folder') {
      return null;
    }
  }

  const child = createNode(kind, label);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, child),
    nodeId: child.id,
  };
}

/** Renames a folder or artifact node. */
export function renameLoadTestNode(
  nodes: readonly LoadTestTreeNode[],
  nodeId: string,
  label: string,
): LoadTestTreeNode[] | null {
  const loc = findLoadTestNode(nodes, nodeId);
  if (!loc) {
    return null;
  }

  const next = cloneNodes(nodes);
  const target = findLoadTestNode(next, nodeId);
  if (!target) {
    return null;
  }
  const updated: LoadTestTreeNode = {
    ...target.node,
    label: label.trim() || target.node.label,
  };
  const replace = (list: LoadTestTreeNode[]): LoadTestTreeNode[] =>
    list.map((node) => {
      if (node.id === nodeId) {
        return updated;
      }
      return node.children?.length
        ? { ...node, children: replace([...node.children]) }
        : node;
    });
  return replace(next);
}

function removeNode(nodes: LoadTestTreeNode[], nodeId: string): LoadTestTreeNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: node.children ? removeNode([...node.children], nodeId) : undefined,
    }));
}

/** Deletes a node and its subtree. */
export function deleteLoadTestNode(
  nodes: readonly LoadTestTreeNode[],
  nodeId: string,
): LoadTestTreeNode[] | null {
  if (!findLoadTestNode(nodes, nodeId)) {
    return null;
  }
  return removeNode(cloneNodes(nodes), nodeId);
}

/** Duplicates an artifact as a sibling. */
export function duplicateLoadTestArtifact(
  nodes: readonly LoadTestTreeNode[],
  nodeId: string,
  existingItems: readonly LoadTestTreeItem[],
): { nodes: LoadTestTreeNode[]; nodeId: string } | null {
  const loc = findLoadTestNode(nodes, nodeId);
  if (!loc || loc.node.data?.kind !== 'artifact') {
    return null;
  }

  const existing = findExistingArtifact(existingItems, nodeId);
  const copy = createNode('artifact', `${loc.node.label} copy`);
  const parentId = loc.parent?.id ?? null;
  const result = createLoadTestNode(nodes, parentId, 'artifact', copy.label);
  if (!result) {
    return null;
  }

  if (existing) {
    const replaceCopyData = (list: LoadTestTreeNode[]): LoadTestTreeNode[] =>
      list.map((node) => {
        if (node.id === result.nodeId) {
          return {
            ...node,
            data: { kind: 'artifact' as const, description: existing.description },
          };
        }
        return node.children?.length
          ? { ...node, children: replaceCopyData([...node.children]) }
          : node;
      });
    return { nodes: replaceCopyData(result.nodes), nodeId: result.nodeId };
  }

  return result;
}

function findExistingArtifact(items: readonly LoadTestTreeItem[], id: string): LoadTestArtifact | null {
  for (const item of items) {
    if (isArtifact(item) && item.id === id) {
      return item;
    }
    if (!isArtifact(item)) {
      const found = findExistingArtifact(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** Creates a default artifact payload for a newly created tree node. */
export function createDefaultLoadTestArtifactPayload(
  id: string,
  name: string,
  description = '',
): LoadTestArtifact {
  const ts = new Date().toISOString();
  return {
    id,
    name,
    description,
    tags: [],
    docs: '',
    targetSource: 'collection',
    manualTarget: createDefaultLoadTestManualTarget(),
    profile: createDefaultLoadTestProfile(),
    thresholds: createDefaultLoadTestThresholds(),
    runs: [],
    updatedAt: ts,
  };
}

/** Creates a default folder payload for a newly created tree node. */
export function createDefaultLoadTestFolderPayload(id: string, name: string): LoadTestTreeItem {
  return {
    id,
    name,
    children: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Returns true when the node kind is a folder. */
export function isLoadTestFolderNode(node: LoadTestTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

/** Returns true when the node kind is an artifact. */
export function isLoadTestArtifactNode(node: LoadTestTreeNode): boolean {
  return node.data?.kind === 'artifact' || node.kind === 'artifact';
}

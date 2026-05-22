import type { RegressionArtifact, RegressionTreeItem } from '@shared/testing';
import {
  createDefaultRegressionArtifactPayload,
  createDefaultRegressionProfile,
  createDefaultRegressionThresholds,
} from '@shared/testing';

import { newTestingId } from '@app/core/testing/testing-id';

import type { RegressionTreeKind, RegressionTreeNode } from './regression-tree.types';

function isArtifact(item: RegressionTreeItem): item is RegressionArtifact {
  return 'profile' in item;
}

export interface RegressionNodeLocation {
  readonly node: RegressionTreeNode;
  readonly parent: RegressionTreeNode | null;
  readonly siblings: RegressionTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findRegressionNode(
  nodes: readonly RegressionTreeNode[],
  id: string,
  parent: RegressionTreeNode | null = null,
): RegressionNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findRegressionNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function regressionFolderHasChildren(
  nodes: readonly RegressionTreeNode[],
  folderId: string,
): boolean {
  const loc = findRegressionNode(nodes, folderId);
  return !!loc?.node.children?.length;
}

export function collectRegressionFolderIdsFromNodes(nodes: readonly RegressionTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder' || node.data?.kind === 'folder') {
      ids.push(node.id);
    }
    if (node.children?.length) {
      ids.push(...collectRegressionFolderIdsFromNodes(node.children));
    }
  }
  return ids;
}

export function collectRegressionArtifactIdsForDeletion(
  nodes: readonly RegressionTreeNode[],
  rootId: string,
): string[] {
  const loc = findRegressionNode(nodes, rootId);
  if (!loc) {
    return [];
  }

  const ids: string[] = [];
  const walk = (node: RegressionTreeNode): void => {
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

function cloneNodes(nodes: readonly RegressionTreeNode[]): RegressionTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: RegressionTreeKind, label?: string): RegressionTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New regression');

  if (kind === 'folder') {
    return {
      id,
      label: resolvedLabel,
      kind: 'folder',
      icon: 'folder',
      data: { kind: 'folder', tags: [] },
      children: [],
    };
  }

  return {
    id,
    label: resolvedLabel,
    kind: 'artifact',
    icon: 'target',
    data: { kind: 'artifact', description: '', tags: [], flowCount: 0 },
  };
}

function insertIntoParent(
  nodes: RegressionTreeNode[],
  parentId: string | null,
  child: RegressionTreeNode,
): RegressionTreeNode[] {
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

export function canCreateRegressionFolder(parentId: string | null): boolean {
  return parentId === null;
}

export function createRegressionNode(
  nodes: readonly RegressionTreeNode[],
  parentId: string | null,
  kind: RegressionTreeKind,
  label?: string,
): { nodes: RegressionTreeNode[]; nodeId: string } | null {
  if (kind === 'folder' && !canCreateRegressionFolder(parentId)) {
    return null;
  }

  if (parentId !== null) {
    const parent = findRegressionNode(nodes, parentId);
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

export function renameRegressionNode(
  nodes: readonly RegressionTreeNode[],
  nodeId: string,
  label: string,
): RegressionTreeNode[] | null {
  if (!findRegressionNode(nodes, nodeId)) {
    return null;
  }

  const replace = (list: RegressionTreeNode[]): RegressionTreeNode[] =>
    list.map((node) => {
      if (node.id === nodeId) {
        return { ...node, label: label.trim() || node.label };
      }
      return node.children?.length
        ? { ...node, children: replace([...node.children]) }
        : node;
    });

  return replace(cloneNodes(nodes));
}

function removeNode(nodes: RegressionTreeNode[], nodeId: string): RegressionTreeNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: node.children ? removeNode([...node.children], nodeId) : undefined,
    }));
}

export function deleteRegressionNode(
  nodes: readonly RegressionTreeNode[],
  nodeId: string,
): RegressionTreeNode[] | null {
  if (!findRegressionNode(nodes, nodeId)) {
    return null;
  }
  return removeNode(cloneNodes(nodes), nodeId);
}

function findExistingArtifact(items: readonly RegressionTreeItem[], id: string): RegressionArtifact | null {
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

export function duplicateRegressionArtifact(
  nodes: readonly RegressionTreeNode[],
  nodeId: string,
): { nodes: RegressionTreeNode[]; nodeId: string } | null {
  const loc = findRegressionNode(nodes, nodeId);
  if (!loc || loc.node.data?.kind !== 'artifact') {
    return null;
  }

  const copy = createNode('artifact', `${loc.node.label} copy`);
  const parentId = loc.parent?.id ?? null;
  return createRegressionNode(nodes, parentId, 'artifact', copy.label);
}

export function isRegressionFolderNode(node: RegressionTreeNode): boolean {
  return node.data?.kind === 'folder' || node.kind === 'folder';
}

export function isRegressionArtifactNode(node: RegressionTreeNode): boolean {
  return node.data?.kind === 'artifact' || node.kind === 'artifact';
}

export { createDefaultRegressionArtifactPayload };

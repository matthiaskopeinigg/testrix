import { TEST_SUITE_MAX_FOLDER_DEPTH } from '@shared/testing';
import { isTestSuiteFlow, isTestSuiteFolder, type TestSuiteTreeItem } from '@shared/testing';

import { newTestingId } from '@app/core/testing/testing-id';

import type { TestSuiteTreeKind, TestSuiteTreeNode } from './test-suite-tree.types';

export interface TestSuiteNodeLocation {
  readonly node: TestSuiteTreeNode;
  readonly parent: TestSuiteTreeNode | null;
  readonly siblings: TestSuiteTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the nested tree. */
export function findTestSuiteNode(
  nodes: readonly TestSuiteTreeNode[],
  id: string,
  parent: TestSuiteTreeNode | null = null,
): TestSuiteNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findTestSuiteNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function nodeDepth(nodes: readonly TestSuiteTreeNode[], id: string, depth = 0): number | null {
  for (const node of nodes) {
    if (node.id === id) {
      return depth;
    }
    if (node.children?.length) {
      const found = nodeDepth(node.children, id, depth + 1);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

function subtreeMaxDepth(node: TestSuiteTreeNode, baseDepth: number): number {
  let max = baseDepth;
  for (const child of node.children ?? []) {
    if (child.data?.kind === 'folder' || child.kind === 'folder') {
      max = Math.max(max, subtreeMaxDepth(child, baseDepth + 1));
    }
  }
  return max;
}

/** Returns true if inserting a folder under parentId would exceed max depth. */
export function wouldExceedTestSuiteFolderDepth(
  nodes: readonly TestSuiteTreeNode[],
  parentId: string | null,
): boolean {
  if (!parentId) {
    return false;
  }
  const parentDepth = nodeDepth(nodes, parentId);
  if (parentDepth === null) {
    return true;
  }
  return parentDepth + 1 >= TEST_SUITE_MAX_FOLDER_DEPTH;
}

export function testSuiteFolderHasChildren(
  nodes: readonly TestSuiteTreeNode[],
  folderId: string,
): boolean {
  const loc = findTestSuiteNode(nodes, folderId);
  return !!loc?.node.children?.length;
}

export function collectTestSuiteFlowIdsForDeletion(
  nodes: readonly TestSuiteTreeNode[],
  rootId: string,
): string[] {
  const loc = findTestSuiteNode(nodes, rootId);
  if (!loc) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: TestSuiteTreeNode): void => {
    if (node.data?.kind === 'flow' || node.kind === 'flow') {
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
export function collectTestSuiteNodeIdsInSubtree(
  nodes: readonly TestSuiteTreeNode[],
  rootId: string,
): readonly string[] {
  const loc = findTestSuiteNode(nodes, rootId);
  if (!loc) {
    return [rootId];
  }

  const ids: string[] = [];
  const walk = (node: TestSuiteTreeNode): void => {
    ids.push(node.id);
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(loc.node);
  return ids;
}

function cloneNodes(nodes: readonly TestSuiteTreeNode[]): TestSuiteTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function createNode(kind: TestSuiteTreeKind, label?: string): TestSuiteTreeNode {
  const id = newTestingId();
  const resolvedLabel = label ?? (kind === 'folder' ? 'New folder' : 'New flow');
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
    kind: 'flow',
    icon: 'play',
    data: { kind: 'flow', description: '' },
  };
}

function insertIntoParent(
  nodes: readonly TestSuiteTreeNode[],
  parentId: string | null,
  child: TestSuiteTreeNode,
): TestSuiteTreeNode[] | null {
  if (!parentId) {
    return [...nodes, child];
  }
  let inserted = false;
  const next = nodes.map((node) => {
    if (node.id === parentId) {
      inserted = true;
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (node.children?.length) {
      const children = insertIntoParent(node.children, parentId, child);
      if (children) {
        inserted = true;
        return { ...node, children };
      }
    }
    return node;
  });
  return inserted ? next : null;
}

/** Creates a folder or flow under an optional parent. */
export function createTestSuiteNode(
  nodes: readonly TestSuiteTreeNode[],
  kind: TestSuiteTreeKind,
  parentId: string | null,
  label?: string,
): TestSuiteTreeNode[] | null {
  if (kind === 'folder' && wouldExceedTestSuiteFolderDepth(nodes, parentId)) {
    return null;
  }
  const child = createNode(kind, label);
  return insertIntoParent(cloneNodes(nodes), parentId, child);
}

/** Renames a node label. */
export function renameTestSuiteNode(
  nodes: readonly TestSuiteTreeNode[],
  nodeId: string,
  label: string,
): TestSuiteTreeNode[] | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return null;
  }
  let updated = false;
  const mapNodes = (list: readonly TestSuiteTreeNode[]): TestSuiteTreeNode[] =>
    list.map((node) => {
      if (node.id === nodeId) {
        updated = true;
        return { ...node, label: trimmed };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });
  const next = mapNodes(cloneNodes(nodes));
  return updated ? next : null;
}

/** Deletes a node and its subtree. */
export function deleteTestSuiteNode(
  nodes: readonly TestSuiteTreeNode[],
  nodeId: string,
): TestSuiteTreeNode[] | null {
  const remove = (list: readonly TestSuiteTreeNode[]): TestSuiteTreeNode[] =>
    list
      .filter((node) => node.id !== nodeId)
      .map((node) =>
        node.children?.length ? { ...node, children: remove(node.children) } : node,
      );

  const before = JSON.stringify(nodes);
  const next = remove(cloneNodes(nodes));
  return JSON.stringify(next) !== before ? next : null;
}


import type {
  CollectionNode,
  CollectionTree,
  DatabaseConnectionTreeItem,
  Environment,
  FlowGraphTemplate,
  SavedQueryTreeItem,
} from '@testrix/contracts';
import {
  collectCollectionDescendantIds,
  collectDatabaseTreeDescendantIds,
  collectEnvironmentIds,
  collectFlowTemplateIds,
  collectQueryTreeDescendantIds,
  collectServiceDescendantIds,
  isDatabaseConnectionFolder,
  isSavedQueryFolder,
} from '@testrix/contracts';
import type { ServiceTreeNode } from '@testrix/contracts';

export interface PackTreeNode {
  id: string;
  name: string;
  kind: 'folder' | 'leaf';
  detail?: string;
  children?: PackTreeNode[];
}

export function collectionNodesToPackTree(nodes: CollectionTree): PackTreeNode[] {
  return nodes.map((node) => collectionNodeToPackTree(node));
}

function collectionNodeToPackTree(node: CollectionNode): PackTreeNode {
  if (node.kind === 'folder') {
    return {
      id: node.id,
      name: node.name,
      kind: 'folder',
      children: node.children.map((child) => collectionNodeToPackTree(child)),
    };
  }
  if (node.kind === 'http') {
    return {
      id: node.id,
      name: node.name,
      kind: 'leaf',
      detail: node.method,
    };
  }
  return {
    id: node.id,
    name: node.name,
    kind: 'leaf',
    detail: 'WS',
  };
}

export function serviceNodesToPackTree<T>(nodes: readonly ServiceTreeNode<T>[]): PackTreeNode[] {
  return nodes.map((node) => serviceNodeToPackTree(node));
}

function serviceNodeToPackTree<T>(node: ServiceTreeNode<T>): PackTreeNode {
  if (node.kind === 'folder') {
    return {
      id: node.id,
      name: node.name,
      kind: 'folder',
      children: node.children.map((child) => serviceNodeToPackTree(child)),
    };
  }
  return {
    id: node.id,
    name: node.name,
    kind: 'leaf',
  };
}

export function findPackTreeNode(nodes: readonly PackTreeNode[], nodeId: string): PackTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId)
      return node;
    if (node.children?.length) {
      const found = findPackTreeNode(node.children, nodeId);
      if (found)
        return found;
    }
  }
  return null;
}

export function collectPackDescendantIds(node: PackTreeNode): string[] {
  if (node.kind !== 'folder' || !node.children?.length)
    return [node.id];
  const ids = [node.id];
  for (const child of node.children)
    ids.push(...collectPackDescendantIds(child));
  return ids;
}

export function getPackDescendantIds(nodes: readonly PackTreeNode[], nodeId: string): readonly string[] {
  const node = findPackTreeNode(nodes, nodeId);
  if (!node)
    return [nodeId];
  return collectPackDescendantIds(node);
}

export function collectAllPackTreeIds(nodes: readonly PackTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly PackTreeNode[]): void => {
    for (const node of list) {
      ids.push(...collectPackDescendantIds(node));
    }
  };
  walk(nodes);
  return [...new Set(ids)];
}

export function collectAllCollectionTreeIds(tree: CollectionTree): string[] {
  const ids: string[] = [];
  for (const node of tree)
    ids.push(...collectCollectionDescendantIds(node));
  return ids;
}

export function collectAllServiceTreeIds<T>(tree: readonly ServiceTreeNode<T>[]): string[] {
  const ids: string[] = [];
  for (const node of tree)
    ids.push(...collectServiceDescendantIds(node));
  return ids;
}

export function environmentsToPackTree(envs: readonly Environment[]): PackTreeNode[] {
  return envs.map((env) => ({
    id: env.id,
    name: env.name,
    kind: 'leaf',
  }));
}

export function databaseNodesToPackTree(nodes: readonly DatabaseConnectionTreeItem[]): PackTreeNode[] {
  return nodes.map((node) => databaseNodeToPackTree(node));
}

function databaseNodeToPackTree(node: DatabaseConnectionTreeItem): PackTreeNode {
  if (isDatabaseConnectionFolder(node)) {
    return {
      id: node.id,
      name: node.name,
      kind: 'folder',
      children: node.children.map((child) => databaseNodeToPackTree(child)),
    };
  }
  return {
    id: node.id,
    name: node.name,
    kind: 'leaf',
    detail: node.type,
  };
}

export function queryNodesToPackTree(nodes: readonly SavedQueryTreeItem[]): PackTreeNode[] {
  return nodes.map((node) => queryNodeToPackTree(node));
}

function queryNodeToPackTree(node: SavedQueryTreeItem): PackTreeNode {
  if (isSavedQueryFolder(node)) {
    return {
      id: node.id,
      name: node.name,
      kind: 'folder',
      children: node.children.map((child) => queryNodeToPackTree(child)),
    };
  }
  return {
    id: node.id,
    name: node.name,
    kind: 'leaf',
  };
}

export function templatesToPackTree(templates: readonly FlowGraphTemplate[]): PackTreeNode[] {
  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    kind: 'leaf',
    detail: template.tags[0],
  }));
}

export function collectAllEnvironmentIds(envs: readonly Environment[]): string[] {
  return collectEnvironmentIds(envs);
}

export function collectAllDatabaseTreeIds(nodes: readonly DatabaseConnectionTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes)
    ids.push(...collectDatabaseTreeDescendantIds(node));
  return ids;
}

export function collectAllQueryTreeIds(nodes: readonly SavedQueryTreeItem[]): string[] {
  const ids: string[] = [];
  for (const node of nodes)
    ids.push(...collectQueryTreeDescendantIds(node));
  return ids;
}

export function collectAllFlowTemplateIds(templates: readonly FlowGraphTemplate[]): string[] {
  return collectFlowTemplateIds(templates);
}

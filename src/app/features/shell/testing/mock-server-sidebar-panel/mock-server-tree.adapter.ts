import {
  createDefaultMockResponse,
  isMockServerEndpoint,
  type MockServerEndpoint,
  type MockServerTreeItem,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { MockServerTreeKind, MockServerTreeNode } from './mock-server-tree.types';

function iconForKind(kind: MockServerTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'api';
}

function endpointSubtitle(endpoint: MockServerEndpoint): string | undefined {
  const matcher = endpoint.matchers[0];
  if (!matcher) {
    return undefined;
  }
  const methods =
    matcher.methods.length > 0 ? matcher.methods.join(', ') : 'ANY';
  return `${methods} ${matcher.path.value}`;
}

/** Maps persisted mock server items to tx-tree nodes. */
export function toMockServerTreeNodes(fileItems: readonly MockServerTreeItem[]): MockServerTreeNode[] {
  return fileItems.map(toMockServerTreeNode);
}

function toMockServerTreeNode(item: MockServerTreeItem): MockServerTreeNode {
  if (isMockServerEndpoint(item)) {
    const description = item.description?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: endpointSubtitle(item) ?? description,
      kind: 'endpoint',
      icon: iconForKind('endpoint'),
      tags: item.tags,
      data: {
        kind: 'endpoint',
        description: item.description,
        tags: item.tags,
        updatedAt: item.updatedAt,
        enabled: item.enabled,
      },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder', updatedAt: item.updatedAt },
    children: item.children.map(toMockServerTreeNode),
  };
}

/** Merges tree structure with existing persisted items. */
export function fromMockServerTreeNodesWithExisting(
  treeNodes: readonly MockServerTreeNode[],
  existingItems: readonly MockServerTreeItem[],
): MockServerTreeItem[] {
  const existingById = new Map<string, MockServerTreeItem>();
  const indexExisting = (items: readonly MockServerTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isMockServerEndpoint(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromMockServerTreeNode(node, existingById.get(node.id)));
}

function fromMockServerTreeNode(
  node: MockServerTreeNode,
  existing?: MockServerTreeItem,
): MockServerTreeItem {
  const kind = node.data?.kind ?? (node.kind as MockServerTreeKind | undefined) ?? 'endpoint';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isMockServerEndpoint(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      children: (node.children ?? []).map((child) => {
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromMockServerTreeNode(child, prevById);
      }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isMockServerEndpoint(existing) ? existing : null;
  return {
    id: node.id,
    name: node.label,
    description: node.data?.description ?? prev?.description ?? '',
    tags: prev?.tags ?? [...(node.data?.tags ?? node.tags ?? [])],
    enabled: prev?.enabled ?? node.data?.enabled ?? true,
    priority: prev?.priority ?? 0,
    matchers: prev?.matchers ?? [],
    response: prev?.response ?? createDefaultMockResponse(),
    updatedAt: prev?.updatedAt ?? ts,
  };
}

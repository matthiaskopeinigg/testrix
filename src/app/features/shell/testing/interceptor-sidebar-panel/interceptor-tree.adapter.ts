import type { InterceptorRule, InterceptorTreeItem } from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { InterceptorTreeKind, InterceptorTreeNode } from './interceptor-tree.types';

function isRule(item: InterceptorTreeItem): item is InterceptorRule {
  return 'matchUrl' in item;
}

function iconForKind(kind: InterceptorTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'interceptor';
}

/** Maps persisted interceptor items to tx-tree nodes. */
export function toInterceptorTreeNodes(fileItems: readonly InterceptorTreeItem[]): InterceptorTreeNode[] {
  return fileItems.map(toInterceptorTreeNode);
}

function toInterceptorTreeNode(item: InterceptorTreeItem): InterceptorTreeNode {
  if (isRule(item)) {
    const subtitle = item.matchUrl?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: subtitle || undefined,
      kind: 'rule',
      icon: iconForKind('rule'),
      data: {
        kind: 'rule',
        matchUrl: item.matchUrl,
        enabled: item.enabled,
        updatedAt: item.updatedAt,
      },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder', updatedAt: item.updatedAt },
    children: item.children.map(toInterceptorTreeNode),
  };
}

/** Merges tree structure with existing persisted items. */
export function fromInterceptorTreeNodesWithExisting(
  treeNodes: readonly InterceptorTreeNode[],
  existingItems: readonly InterceptorTreeItem[],
): InterceptorTreeItem[] {
  const existingById = new Map<string, InterceptorTreeItem>();
  const indexExisting = (items: readonly InterceptorTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isRule(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromInterceptorTreeNode(node, existingById.get(node.id)));
}

function fromInterceptorTreeNode(
  node: InterceptorTreeNode,
  existing?: InterceptorTreeItem,
): InterceptorTreeItem {
  const kind = node.data?.kind ?? (node.kind as InterceptorTreeKind | undefined) ?? 'rule';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isRule(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      children: (node.children ?? []).map((child) => {
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromInterceptorTreeNode(child, prevById);
      }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isRule(existing) ? existing : null;
  const ruleMeta = node.data?.kind === 'rule' ? node.data : null;
  return {
    id: node.id,
    name: node.label,
    enabled: prev?.enabled ?? ruleMeta?.enabled ?? true,
    matchUrl: prev?.matchUrl ?? ruleMeta?.matchUrl ?? '*',
    action: prev?.action ?? 'proxy',
    mockStatus: prev?.mockStatus,
    mockBody: prev?.mockBody ?? { mode: 'none' },
    updatedAt: prev?.updatedAt ?? ts,
  };
}

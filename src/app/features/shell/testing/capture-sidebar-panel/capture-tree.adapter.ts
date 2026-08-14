import {
  createDefaultCaptureItem,
  isCaptureItem,
  type CaptureItem,
  type CaptureTreeItem,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { CaptureTreeKind, CaptureTreeNode } from './capture-tree.types';

function iconForKind(kind: CaptureTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'globe';
}

/** Maps persisted capture items to tx-tree nodes. */
export function toCaptureTreeNodes(fileItems: readonly CaptureTreeItem[]): CaptureTreeNode[] {
  return fileItems.map(toCaptureTreeNode);
}

function toCaptureTreeNode(item: CaptureTreeItem): CaptureTreeNode {
  if (isCaptureItem(item)) {
    const subtitle = item.startUrl?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: subtitle || undefined,
      kind: 'session',
      icon: iconForKind('session'),
      data: { kind: 'session', startUrl: item.startUrl, updatedAt: item.updatedAt },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder', updatedAt: item.updatedAt },
    children: item.children.map(toCaptureTreeNode),
  };
}

/** Merges tree structure with existing persisted items. */
export function fromCaptureTreeNodesWithExisting(
  treeNodes: readonly CaptureTreeNode[],
  existingItems: readonly CaptureTreeItem[],
): CaptureTreeItem[] {
  const existingById = new Map<string, CaptureTreeItem>();
  const indexExisting = (items: readonly CaptureTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isCaptureItem(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromCaptureTreeNode(node, existingById.get(node.id)));
}

function fromCaptureTreeNode(node: CaptureTreeNode, existing?: CaptureTreeItem): CaptureTreeItem {
  const kind = node.data?.kind ?? (node.kind as CaptureTreeKind | undefined) ?? 'session';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isCaptureItem(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      children: (node.children ?? []).map((child) => {
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromCaptureTreeNode(child, prevById);
      }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isCaptureItem(existing) ? existing : null;
  const session: CaptureItem = prev ?? createDefaultCaptureItem(node.id, node.label, ts);
  return {
    ...session,
    id: node.id,
    name: node.label,
    updatedAt: prev?.updatedAt ?? ts,
  };
}

import type { LoadTestArtifact, LoadTestTreeItem } from '@shared/testing';
import {
  createDefaultLoadTestProfile,
  createDefaultLoadTestThresholds,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import type { LoadTestTreeKind, LoadTestTreeNode } from './load-test-tree.types';

function isArtifact(item: LoadTestTreeItem): item is LoadTestArtifact {
  return 'profile' in item;
}

function iconForKind(kind: LoadTestTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'zap';
}

/** Maps persisted load test items to tx-tree nodes. */
export function toLoadTestTreeNodes(fileItems: readonly LoadTestTreeItem[]): LoadTestTreeNode[] {
  return fileItems.map(toLoadTestTreeNode);
}

function toLoadTestTreeNode(item: LoadTestTreeItem): LoadTestTreeNode {
  if (isArtifact(item)) {
    const description = item.description?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: description || undefined,
      kind: 'artifact',
      icon: iconForKind('artifact'),
      data: { kind: 'artifact', description: item.description },
    };
  }

  return {
    id: item.id,
    label: item.name,
    kind: 'folder',
    icon: iconForKind('folder'),
    data: { kind: 'folder' },
    children: item.children.map(toLoadTestTreeNode),
  };
}

/** Maps tx-tree nodes back to persisted load test items. */
export function fromLoadTestTreeNodes(
  treeNodes: readonly LoadTestTreeNode[],
  existingItems: readonly LoadTestTreeItem[],
): LoadTestTreeItem[] {
  return fromLoadTestTreeNodesWithExisting(treeNodes, existingItems);
}

function fromLoadTestTreeNode(node: LoadTestTreeNode, existing?: LoadTestTreeItem): LoadTestTreeItem {
  const kind = node.data?.kind ?? (node.kind as LoadTestTreeKind | undefined) ?? 'artifact';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isArtifact(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      children: (node.children ?? []).map((child, index) => {
        const prevChild = prev?.children[index];
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromLoadTestTreeNode(child, prevById ?? prevChild);
      }),
      updatedAt: prev?.updatedAt ?? ts,
    };
  }

  const prev = existing && isArtifact(existing) ? existing : null;
  return {
    id: node.id,
    name: node.label,
    description: node.data?.description ?? prev?.description ?? '',
    docs: prev?.docs ?? '',
    targetRequestId: prev?.targetRequestId,
    profile: prev?.profile ?? createDefaultLoadTestProfile(),
    thresholds: prev?.thresholds ?? createDefaultLoadTestThresholds(),
    scenarios: prev?.scenarios ?? [],
    runs: prev?.runs ?? [],
    updatedAt: prev?.updatedAt ?? ts,
  };
}

/** Merges tree structure with existing persisted items to preserve artifact fields. */
export function fromLoadTestTreeNodesWithExisting(
  treeNodes: readonly LoadTestTreeNode[],
  existingItems: readonly LoadTestTreeItem[],
): LoadTestTreeItem[] {
  const existingById = new Map<string, LoadTestTreeItem>();
  const indexExisting = (items: readonly LoadTestTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isArtifact(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromLoadTestTreeNode(node, existingById.get(node.id)));
}

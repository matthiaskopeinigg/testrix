import type { RegressionArtifact, RegressionTreeItem } from '@shared/testing';
import {
  createDefaultRegressionProfile,
  createDefaultRegressionThresholds,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { regressionTreeTags } from './regression-tree-tags';
import type { RegressionTreeKind, RegressionTreeNode } from './regression-tree.types';

function isArtifact(item: RegressionTreeItem): item is RegressionArtifact {
  return 'profile' in item;
}

function iconForKind(kind: RegressionTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'target';
}

function lastRunStatus(
  artifact: RegressionArtifact,
): RegressionTreeNode['data'] extends infer D ? D extends { lastRunStatus?: infer S } ? S : never : never {
  const last = artifact.runs[0];
  if (!last || last.status === 'running') {
    return null;
  }
  if (last.status === 'passed' || last.status === 'failed' || last.status === 'cancelled') {
    return last.status;
  }
  return null;
}

/** Maps persisted regression items to tx-tree nodes. */
export function toRegressionTreeNodes(fileItems: readonly RegressionTreeItem[]): RegressionTreeNode[] {
  return fileItems.map(toRegressionTreeNode);
}

function toRegressionTreeNode(item: RegressionTreeItem): RegressionTreeNode {
  if (isArtifact(item)) {
    const description = item.description?.trim();
    const tags = regressionTreeTags(item);
    return {
      id: item.id,
      label: item.name,
      subtitle: description || undefined,
      kind: 'artifact',
      icon: iconForKind('artifact'),
      tags,
      data: {
        kind: 'artifact',
        description: item.description,
        tags: item.tags,
        archivedAt: item.archivedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        flowCount: item.flowIds.length,
        lastRunStatus: lastRunStatus(item),
      },
    };
  }

  const tags = regressionTreeTags(item);
  return {
    id: item.id,
    label: item.name,
    subtitle: item.description?.trim() || undefined,
    kind: 'folder',
    icon: iconForKind('folder'),
    tags,
    data: {
      kind: 'folder',
      description: item.description,
      tags: item.tags,
      archivedAt: item.archivedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
    children: item.children.map(toRegressionTreeNode),
  };
}

function fromRegressionTreeNode(node: RegressionTreeNode, existing?: RegressionTreeItem): RegressionTreeItem {
  const kind = node.data?.kind ?? (node.kind as RegressionTreeKind | undefined) ?? 'artifact';
  const ts = new Date().toISOString();

  if (kind === 'folder') {
    const prev = existing && !isArtifact(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      description: prev?.description ?? node.data?.description ?? '',
      tags: prev?.tags ?? [...(node.data?.tags ?? node.tags ?? [])],
      archivedAt: prev?.archivedAt ?? node.data?.archivedAt ?? null,
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
      children: (node.children ?? []).map((child) => {
        const prevById = prev?.children.find((c) => c.id === child.id);
        return fromRegressionTreeNode(child, prevById);
      }),
    };
  }

  const prev = existing && isArtifact(existing) ? existing : null;
  return {
    id: node.id,
    name: node.label,
    description: node.data?.description ?? prev?.description ?? '',
    tags: prev?.tags ?? [...(node.data?.tags ?? node.tags ?? [])],
    archivedAt: prev?.archivedAt ?? node.data?.archivedAt ?? null,
    createdAt: prev?.createdAt ?? ts,
    updatedAt: ts,
    docs: prev?.docs ?? '',
    release: prev?.release ?? '',
    flowIds: prev?.flowIds ?? [],
    profile: prev?.profile ?? createDefaultRegressionProfile(),
    thresholds: prev?.thresholds ?? createDefaultRegressionThresholds(),
    runs: prev?.runs ?? [],
  };
}

/** Merges tree structure with existing persisted items to preserve artifact fields. */
export function fromRegressionTreeNodesWithExisting(
  treeNodes: readonly RegressionTreeNode[],
  existingItems: readonly RegressionTreeItem[],
): RegressionTreeItem[] {
  const existingById = new Map<string, RegressionTreeItem>();
  const indexExisting = (items: readonly RegressionTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (!isArtifact(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);

  return treeNodes.map((node) => fromRegressionTreeNode(node, existingById.get(node.id)));
}

export function fromRegressionTreeNodes(
  treeNodes: readonly RegressionTreeNode[],
  existingItems: readonly RegressionTreeItem[],
): RegressionTreeItem[] {
  return fromRegressionTreeNodesWithExisting(treeNodes, existingItems);
}

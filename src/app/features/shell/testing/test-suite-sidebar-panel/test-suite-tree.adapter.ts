import {
  isTestSuiteFlow,
  isTestSuiteFolder,
  type TestSuiteFlow,
  type TestSuiteTreeItem,
} from '@shared/testing';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

import { testSuiteTreeTags } from './test-suite-tree-tags';
import type { TestSuiteTreeKind, TestSuiteTreeNode } from './test-suite-tree.types';

function iconForKind(kind: TestSuiteTreeKind): TxIconName {
  return kind === 'folder' ? 'folder' : 'play';
}

/** Maps persisted test suite items to tx-tree nodes. */
export function toTestSuiteTreeNodes(items: readonly TestSuiteTreeItem[]): TestSuiteTreeNode[] {
  return items.map(toTestSuiteTreeNode);
}

function toTestSuiteTreeNode(item: TestSuiteTreeItem): TestSuiteTreeNode {
  if (isTestSuiteFlow(item)) {
    const description = item.description?.trim();
    return {
      id: item.id,
      label: item.name,
      subtitle: description || undefined,
      tags: testSuiteTreeTags(item),
      critical: item.isCritical === true,
      kind: 'flow',
      icon: iconForKind('flow'),
      data: {
        kind: 'flow',
        description: item.description,
        tags: item.tags,
        updatedAt: item.updatedAt,
        isCritical: item.isCritical,
      },
    };
  }

  const description = item.description?.trim();
  return {
    id: item.id,
    label: item.name,
    subtitle: description || undefined,
    tags: testSuiteTreeTags(item),
    kind: 'folder',
    icon: iconForKind('folder'),
    data: {
      kind: 'folder',
      description: item.description,
      tags: item.tags,
      updatedAt: item.updatedAt,
    },
    children: toTestSuiteTreeNodes(item.children),
  };
}

function fromTestSuiteTreeNode(node: TestSuiteTreeNode, existing?: TestSuiteTreeItem): TestSuiteTreeItem {
  const kind = node.data?.kind ?? (node.kind as TestSuiteTreeKind);
  const ts = new Date().toISOString();

  if (kind === 'flow') {
    const prev = existing && isTestSuiteFlow(existing) ? existing : null;
    return {
      id: node.id,
      name: node.label,
      description: node.data?.description ?? prev?.description ?? '',
      tags: prev?.tags ?? [],
      environmentId: prev?.environmentId ?? null,
      isCritical: prev?.isCritical,
      e2eShowWindow: prev?.e2eShowWindow,
      e2eKeepWindowOpen: prev?.e2eKeepWindowOpen,
      lastRunStatus: prev?.lastRunStatus ?? 'never',
      lastRunAt: prev?.lastRunAt ?? null,
      lastRunDurationMs: prev?.lastRunDurationMs,
      nodes: prev?.nodes ?? [],
      updatedAt: prev?.updatedAt ?? ts,
    } satisfies TestSuiteFlow;
  }

  const prev = existing && isTestSuiteFolder(existing) ? existing : null;
  return {
    id: node.id,
    name: node.label,
    description: node.data?.description ?? prev?.description ?? '',
    tags: node.data?.tags ?? prev?.tags ?? [],
    children: (node.children ?? []).map((child, index) => {
      const prevChild = prev?.children[index];
      const prevById = prev?.children.find((c) => c.id === child.id);
      return fromTestSuiteTreeNode(child, prevById ?? prevChild);
    }),
    updatedAt: prev?.updatedAt ?? ts,
  };
}

/** Merges tree structure with existing persisted items. */
export function fromTestSuiteTreeNodesWithExisting(
  treeNodes: readonly TestSuiteTreeNode[],
  existingItems: readonly TestSuiteTreeItem[],
): TestSuiteTreeItem[] {
  const existingById = new Map<string, TestSuiteTreeItem>();
  const indexExisting = (items: readonly TestSuiteTreeItem[]): void => {
    for (const item of items) {
      existingById.set(item.id, item);
      if (isTestSuiteFolder(item)) {
        indexExisting(item.children);
      }
    }
  };
  indexExisting(existingItems);
  return treeNodes.map((node) => fromTestSuiteTreeNode(node, existingById.get(node.id)));
}

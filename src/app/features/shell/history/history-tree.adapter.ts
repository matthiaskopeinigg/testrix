import type { HistoryItem } from '@shared/config';

import type { HistoryTreeNode } from './history-tree.types';
import { historyItemDurationMs, historyItemStatusCode } from './history-entry-display';

/** Maps persisted history items to tx-tree leaf nodes. */
export function toTreeNodes(items: readonly HistoryItem[]): HistoryTreeNode[] {
  return items.map(toTreeNode);
}

function toTreeNode(item: HistoryItem): HistoryTreeNode {
  return {
    id: item.id,
    label: item.label,
    kind: 'leaf',
    icon: 'api',
    order: item.order,
    data: {
      kind: 'history',
      method: item.method,
      url: item.url,
      requestedAt: item.requestedAt,
      requestId: item.requestId,
      snapshotId: item.snapshotId,
      statusCode: historyItemStatusCode(item),
      durationMs: historyItemDurationMs(item),
      snapshot: item.snapshot,
      request: item.request,
    },
  };
}

/** Strips presentation fields before persisting. */
export function fromTreeNodes(treeNodes: readonly HistoryTreeNode[]): HistoryItem[] {
  return treeNodes.map(fromTreeNode);
}

function fromTreeNode(node: HistoryTreeNode): HistoryItem {
  return {
    id: node.id,
    label: node.label,
    method: node.data?.method ?? 'GET',
    url: node.data?.url ?? '/',
    requestedAt: node.data?.requestedAt ?? new Date().toISOString(),
    order: node.order,
    requestId: node.data?.requestId,
    snapshotId: node.data?.snapshotId,
    snapshot: node.data?.snapshot,
    request: node.data?.request,
  };
}

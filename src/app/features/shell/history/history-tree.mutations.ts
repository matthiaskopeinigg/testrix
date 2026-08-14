import type { HistoryTreeNode } from './history-tree.types';

export interface HistoryItemLocation {
  readonly node: HistoryTreeNode;
  readonly index: number;
}

/** Finds a history node by id in the flat root list. */
export function findHistoryNode(
  nodes: readonly HistoryTreeNode[],
  id: string,
): HistoryItemLocation | null {
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) {
    return null;
  }
  return { node: nodes[index], index };
}

/** Deletes a history entry by id. */
export function deleteHistoryNode(
  nodes: readonly HistoryTreeNode[],
  id: string,
): HistoryTreeNode[] | null {
  const next = nodes.filter((node) => node.id !== id);
  return next.length === nodes.length ? null : next;
}

/** Removes all history entries. */
export function clearHistoryNodes(): HistoryTreeNode[] {
  return [];
}

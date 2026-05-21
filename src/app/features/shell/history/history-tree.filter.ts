import type { HistoryTreeNode } from './history-tree.types';

/** Filters a flat history list by label, method, or url. */
export function filterHistoryTree(
  nodes: readonly HistoryTreeNode[],
  query: string,
): HistoryTreeNode[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...nodes];
  }

  return nodes.filter((node) => {
    const method = node.data?.method?.toLowerCase() ?? '';
    const url = node.data?.url?.toLowerCase() ?? '';
    return (
      node.label.toLowerCase().includes(trimmed) ||
      method.includes(trimmed) ||
      url.includes(trimmed)
    );
  });
}

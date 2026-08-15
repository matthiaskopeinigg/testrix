import type { ConnectionTreeNode } from './connection-tree.types';

/** Filters the connection tree by name or subtitle, keeping ancestors of matches. */
export function filterConnectionTree(
  nodes: readonly ConnectionTreeNode[],
  query: string,
): ConnectionTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly ConnectionTreeNode[]): ConnectionTreeNode[] => {
    const out: ConnectionTreeNode[] = [];
    for (const node of list) {
      const labelMatch =
        node.label.toLowerCase().includes(q) ||
        (node.subtitle?.toLowerCase().includes(q) ?? false) ||
        (node.data?.kind === 'connection' && node.data.type?.toLowerCase().includes(q));
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (labelMatch || childMatch) {
        out.push({
          ...node,
          children: childMatch ? children : node.children,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

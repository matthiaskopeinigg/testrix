import type { InterceptorTreeNode } from './interceptor-tree.types';

/** Filters interceptor tree nodes by label and match URL (keeps ancestor folders). */
export function filterInterceptorTree(
  nodes: readonly InterceptorTreeNode[],
  query: string,
): InterceptorTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly InterceptorTreeNode[]): InterceptorTreeNode[] => {
    const out: InterceptorTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const urlMatch =
        (node.data?.kind === 'rule' ? (node.data.matchUrl ?? node.subtitle ?? '') : '')
          .toLowerCase()
          .includes(q);
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;

      if (labelMatch || urlMatch || childMatch) {
        out.push({
          ...node,
          children: children?.length ? children : node.children && childMatch ? children : undefined,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

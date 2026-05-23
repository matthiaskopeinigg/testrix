import type { MockServerTreeNode } from './mock-server-tree.types';

export function filterMockServerTreeByTags(
  nodes: readonly MockServerTreeNode[],
  tagFilter: readonly string[],
): MockServerTreeNode[] {
  if (!tagFilter.length) {
    return [...nodes];
  }
  const required = new Set(tagFilter.map((t) => t.toLowerCase()));

  const filterNodes = (list: readonly MockServerTreeNode[]): MockServerTreeNode[] => {
    const out: MockServerTreeNode[] = [];
    for (const node of list) {
      const tags = (node.data?.tags ?? node.tags ?? []).map((t) => t.toLowerCase());
      const tagMatch = [...required].every((t) => tags.includes(t));
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (tagMatch || childMatch) {
        out.push({ ...node, children: children?.length ? children : undefined });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

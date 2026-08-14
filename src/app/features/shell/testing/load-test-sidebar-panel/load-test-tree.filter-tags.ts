import type { LoadTestTreeNode } from './load-test-tree.types';

/** Filters tree to load tests matching any of the selected tags. */
export function filterLoadTestTreeByTags(
  nodes: readonly LoadTestTreeNode[],
  tagFilter: readonly string[],
): LoadTestTreeNode[] {
  if (tagFilter.length === 0) {
    return [...nodes];
  }
  const wanted = new Set(tagFilter.map((t) => t.toLowerCase()));

  const filterNodes = (list: readonly LoadTestTreeNode[]): LoadTestTreeNode[] => {
    const out: LoadTestTreeNode[] = [];
    for (const node of list) {
      const tags = node.data?.tags ?? node.tags ?? [];
      const tagMatch = tags.some((tag) => wanted.has(tag.toLowerCase()));
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (tagMatch || childMatch) {
        out.push({
          ...node,
          children: children?.length ? children : undefined,
        });
      }
    }
    return out;
  };

  return filterNodes(nodes);
}

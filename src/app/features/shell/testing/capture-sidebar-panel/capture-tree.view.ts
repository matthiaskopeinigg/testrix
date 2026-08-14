import type { CaptureSidebarFilter, CaptureSidebarSortBy } from '@shared/config';

import { filterCaptureTreeByKind } from './capture-tree.filter-kind';
import { sortCaptureTree } from './capture-tree.sort';
import type { CaptureTreeNode } from './capture-tree.types';

export interface CaptureTreeViewOptions {
  readonly query: string;
  readonly kindFilter: CaptureSidebarFilter;
  readonly sortBy: CaptureSidebarSortBy;
}

function filterCaptureTree(nodes: readonly CaptureTreeNode[], query: string): CaptureTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }

  const filterNodes = (list: readonly CaptureTreeNode[]): CaptureTreeNode[] => {
    const out: CaptureTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const urlMatch =
        (node.data?.kind === 'session' ? (node.data.startUrl ?? node.subtitle ?? '') : '')
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

export function applyCaptureTreeView(
  nodes: readonly CaptureTreeNode[],
  options: CaptureTreeViewOptions,
): CaptureTreeNode[] {
  let next = sortCaptureTree(nodes, options.sortBy);
  next = filterCaptureTreeByKind(next, options.kindFilter);
  return filterCaptureTree(next, options.query);
}

import type { MockServerSidebarFilter, MockServerSidebarSortBy } from '@shared/config';

import { filterMockServerTree } from './mock-server-tree.filter';
import { filterMockServerTreeByKind } from './mock-server-tree.filter-kind';
import { filterMockServerTreeByTags } from './mock-server-tree.filter-tags';
import { sortMockServerTree } from './mock-server-tree.sort';
import type { MockServerTreeNode } from './mock-server-tree.types';

export interface MockServerTreeViewOptions {
  readonly query: string;
  readonly kindFilter: MockServerSidebarFilter;
  readonly sortBy: MockServerSidebarSortBy;
  readonly tagFilter: readonly string[];
}

export function applyMockServerTreeView(
  nodes: readonly MockServerTreeNode[],
  options: MockServerTreeViewOptions,
): MockServerTreeNode[] {
  let next = sortMockServerTree(nodes, options.sortBy);
  next = filterMockServerTreeByKind(next, options.kindFilter);
  next = filterMockServerTreeByTags(next, options.tagFilter);
  return filterMockServerTree(next, options.query);
}

import type { LoadTestSidebarFilter, LoadTestSidebarSortBy } from '@shared/config';

import { filterLoadTestTree } from './load-test-tree.filter';
import { filterLoadTestTreeByKind } from './load-test-tree.filter-kind';
import { filterLoadTestTreeByTags } from './load-test-tree.filter-tags';
import { sortLoadTestTree } from './load-test-tree.sort';
import type { LoadTestTreeNode } from './load-test-tree.types';

export interface LoadTestTreeViewOptions {
  readonly query: string;
  readonly kindFilter: LoadTestSidebarFilter;
  readonly sortBy: LoadTestSidebarSortBy;
  readonly tagFilter: readonly string[];
}

/**
 * Applies presentation sort, kind filter, tags, then search to load test tree nodes.
 */
export function applyLoadTestTreeView(
  nodes: readonly LoadTestTreeNode[],
  options: LoadTestTreeViewOptions,
): LoadTestTreeNode[] {
  let next = sortLoadTestTree(nodes, options.sortBy);
  next = filterLoadTestTreeByKind(next, options.kindFilter);
  next = filterLoadTestTreeByTags(next, options.tagFilter);
  return filterLoadTestTree(next, options.query);
}

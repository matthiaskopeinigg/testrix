import type { RegressionSidebarFilter, RegressionSidebarSortBy } from '@shared/config';

import { filterRegressionByTags, filterRegressionTree } from './regression-tree.filter';
import { filterRegressionTreeByKind } from './regression-tree.filter-kind';
import { sortRegressionTree } from './regression-tree.sort';
import type { RegressionTreeNode } from './regression-tree.types';

export interface RegressionTreeViewOptions {
  readonly query: string;
  readonly kindFilter: RegressionSidebarFilter;
  readonly sortBy: RegressionSidebarSortBy;
  readonly tagFilter: readonly string[];
}

/**
 * Applies presentation sort, kind filter, tags, then search to regression tree nodes.
 */
export function applyRegressionTreeView(
  nodes: readonly RegressionTreeNode[],
  options: RegressionTreeViewOptions,
): RegressionTreeNode[] {
  let next = sortRegressionTree(nodes, options.sortBy);
  next = filterRegressionTreeByKind(next, options.kindFilter);
  next = filterRegressionByTags(next, options.tagFilter);
  return filterRegressionTree(next, options.query);
}

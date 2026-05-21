import type { EnvironmentSidebarFilter, EnvironmentSidebarSortBy } from '@shared/config';

import { filterEnvironmentTree } from './environment-tree.filter';
import { filterEnvironmentTreeByKind } from './environment-tree.filter-kind';
import { sortEnvironmentTreeByName } from './environment-tree.sort';
import type { EnvironmentTreeNode } from './environment-tree.types';

export interface EnvironmentTreeViewOptions {
  readonly query: string;
  readonly filter: EnvironmentSidebarFilter;
  readonly sortBy: EnvironmentSidebarSortBy;
}

/**
 * Applies presentation sort, kind filter, then search to environment tree nodes.
 */
export function applyEnvironmentTreeView(
  nodes: readonly EnvironmentTreeNode[],
  options: EnvironmentTreeViewOptions,
): EnvironmentTreeNode[] {
  let next: EnvironmentTreeNode[] = [...nodes];
  if (options.sortBy === 'name') {
    next = sortEnvironmentTreeByName(next);
  }
  next = filterEnvironmentTreeByKind(next, options.filter);
  return filterEnvironmentTree(next, options.query);
}

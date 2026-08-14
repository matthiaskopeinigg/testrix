import type { InterceptorSidebarFilter, InterceptorSidebarSortBy } from '@shared/config';

import { filterInterceptorTree } from './interceptor-tree.filter';
import { filterInterceptorTreeByKind } from './interceptor-tree.filter-kind';
import { sortInterceptorTree } from './interceptor-tree.sort';
import type { InterceptorTreeNode } from './interceptor-tree.types';

export interface InterceptorTreeViewOptions {
  readonly query: string;
  readonly kindFilter: InterceptorSidebarFilter;
  readonly sortBy: InterceptorSidebarSortBy;
}

/** Applies kind filter, search, and sort to interceptor tree nodes. */
export function applyInterceptorTreeView(
  nodes: readonly InterceptorTreeNode[],
  options: InterceptorTreeViewOptions,
): InterceptorTreeNode[] {
  let next = filterInterceptorTreeByKind(nodes, options.kindFilter);
  next = filterInterceptorTree(next, options.query);
  return sortInterceptorTree(next, options.sortBy);
}

import type { TestSuiteSidebarFilter, TestSuiteSidebarSortBy } from '@shared/config';

import { filterTestSuiteTreeByTags } from './test-suite-tree.filter-tags';
import { filterTestSuiteTree } from './test-suite-tree.filter';
import { filterTestSuiteTreeByKind } from './test-suite-tree.filter-kind';
import { sortTestSuiteTree } from './test-suite-tree.sort';
import type { TestSuiteTreeNode } from './test-suite-tree.types';

export interface TestSuiteTreeViewOptions {
  readonly query: string;
  readonly kindFilter: TestSuiteSidebarFilter;
  readonly sortBy: TestSuiteSidebarSortBy;
  readonly tagFilter: readonly string[];
}

/**
 * Applies presentation sort, kind filter, tags, then search to suite tree nodes.
 */
export function applyTestSuiteTreeView(
  nodes: readonly TestSuiteTreeNode[],
  options: TestSuiteTreeViewOptions,
): TestSuiteTreeNode[] {
  let next = sortTestSuiteTree(nodes, options.sortBy);
  next = filterTestSuiteTreeByKind(next, options.kindFilter);
  next = filterTestSuiteTreeByTags(next, options.tagFilter);
  return filterTestSuiteTree(next, options.query);
}

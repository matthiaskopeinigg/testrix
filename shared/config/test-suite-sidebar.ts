import {
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarSortBy,
} from './regression-sidebar';

/** Sidebar kind filter for the test suite tree. */
export const TEST_SUITE_SIDEBAR_FILTER_IDS = ['all', 'folders', 'flows'] as const;

export type TestSuiteSidebarFilter = (typeof TEST_SUITE_SIDEBAR_FILTER_IDS)[number];

/** Reuses regression sidebar sort ids (saved order, name, date). */
export const TEST_SUITE_SIDEBAR_SORT_BY_IDS = REGRESSION_SIDEBAR_SORT_BY_IDS;

export type TestSuiteSidebarSortBy = RegressionSidebarSortBy;

/** Default test suite sidebar kind filter. */
export const DEFAULT_TEST_SUITE_SIDEBAR_FILTER: TestSuiteSidebarFilter = 'all';

/** Default test suite sidebar sort. */
export const DEFAULT_TEST_SUITE_SIDEBAR_SORT_BY: TestSuiteSidebarSortBy = DEFAULT_REGRESSION_SIDEBAR_SORT_BY;

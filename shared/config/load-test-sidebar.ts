import {
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarSortBy,
} from './regression-sidebar';

/** Sidebar kind filter for the load test tree. */
export const LOAD_TEST_SIDEBAR_FILTER_IDS = ['all', 'folders', 'load-tests'] as const;

export type LoadTestSidebarFilter = (typeof LOAD_TEST_SIDEBAR_FILTER_IDS)[number];

/** Reuses regression sidebar sort ids (saved order, name, date). */
export const LOAD_TEST_SIDEBAR_SORT_BY_IDS = REGRESSION_SIDEBAR_SORT_BY_IDS;

export type LoadTestSidebarSortBy = RegressionSidebarSortBy;

/** Default load test sidebar kind filter. */
export const DEFAULT_LOAD_TEST_SIDEBAR_FILTER: LoadTestSidebarFilter = 'all';

/** Default load test sidebar sort. */
export const DEFAULT_LOAD_TEST_SIDEBAR_SORT_BY: LoadTestSidebarSortBy = DEFAULT_REGRESSION_SIDEBAR_SORT_BY;

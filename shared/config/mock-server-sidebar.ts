import {
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarSortBy,
} from './regression-sidebar';

/** Sidebar kind filter for the mock server tree. */
export const MOCK_SERVER_SIDEBAR_FILTER_IDS = ['all', 'folders', 'endpoints'] as const;

export type MockServerSidebarFilter = (typeof MOCK_SERVER_SIDEBAR_FILTER_IDS)[number];

/** Reuses regression sidebar sort ids (saved order, name, date). */
export const MOCK_SERVER_SIDEBAR_SORT_BY_IDS = REGRESSION_SIDEBAR_SORT_BY_IDS;

export type MockServerSidebarSortBy = RegressionSidebarSortBy;

/** Default mock server sidebar kind filter. */
export const DEFAULT_MOCK_SERVER_SIDEBAR_FILTER: MockServerSidebarFilter = 'all';

/** Default mock server sidebar sort. */
export const DEFAULT_MOCK_SERVER_SIDEBAR_SORT_BY: MockServerSidebarSortBy =
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY;

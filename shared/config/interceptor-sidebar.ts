import {
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarSortBy,
} from './regression-sidebar';

/** Sidebar kind filter for the interceptor rules tree. */
export const INTERCEPTOR_SIDEBAR_FILTER_IDS = ['all', 'folders', 'rules'] as const;

export type InterceptorSidebarFilter = (typeof INTERCEPTOR_SIDEBAR_FILTER_IDS)[number];

export const INTERCEPTOR_SIDEBAR_SORT_BY_IDS = REGRESSION_SIDEBAR_SORT_BY_IDS;

export type InterceptorSidebarSortBy = RegressionSidebarSortBy;

export const DEFAULT_INTERCEPTOR_SIDEBAR_FILTER: InterceptorSidebarFilter = 'all';

export const DEFAULT_INTERCEPTOR_SIDEBAR_SORT_BY: InterceptorSidebarSortBy =
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY;

import {
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarSortBy,
} from './regression-sidebar';

export const CAPTURE_SIDEBAR_FILTER_IDS = ['all', 'folders', 'sessions'] as const;

export type CaptureSidebarFilter = (typeof CAPTURE_SIDEBAR_FILTER_IDS)[number];

export const CAPTURE_SIDEBAR_SORT_BY_IDS = REGRESSION_SIDEBAR_SORT_BY_IDS;

export type CaptureSidebarSortBy = RegressionSidebarSortBy;

export const DEFAULT_CAPTURE_SIDEBAR_FILTER: CaptureSidebarFilter = 'all';

export const DEFAULT_CAPTURE_SIDEBAR_SORT_BY: CaptureSidebarSortBy =
  DEFAULT_REGRESSION_SIDEBAR_SORT_BY;

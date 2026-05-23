/** Sidebar kind filter for the regression tree. */
export const REGRESSION_SIDEBAR_FILTER_IDS = ['all', 'folders', 'regressions'] as const;

export type RegressionSidebarFilter = (typeof REGRESSION_SIDEBAR_FILTER_IDS)[number];

/** Presentation sort for the regression sidebar (does not rewrite persisted order). */
export const REGRESSION_SIDEBAR_SORT_BY_IDS = [
  'saved',
  'name-asc',
  'name-desc',
  'date-new',
  'date-old',
] as const;

export type RegressionSidebarSortBy = (typeof REGRESSION_SIDEBAR_SORT_BY_IDS)[number];

/** Default regression sidebar kind filter. */
export const DEFAULT_REGRESSION_SIDEBAR_FILTER: RegressionSidebarFilter = 'all';

/** Default regression sidebar sort. */
export const DEFAULT_REGRESSION_SIDEBAR_SORT_BY: RegressionSidebarSortBy = 'saved';

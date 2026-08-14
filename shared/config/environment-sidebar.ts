/** Sidebar filter for the environments tree. */
export const ENVIRONMENT_SIDEBAR_FILTER_IDS = ['all', 'folders', 'variables'] as const;

export type EnvironmentSidebarFilter = (typeof ENVIRONMENT_SIDEBAR_FILTER_IDS)[number];

/** Presentation sort for the environments tree (does not rewrite persisted order). */
export const ENVIRONMENT_SIDEBAR_SORT_BY_IDS = ['order', 'name'] as const;

export type EnvironmentSidebarSortBy = (typeof ENVIRONMENT_SIDEBAR_SORT_BY_IDS)[number];

/** Default sidebar filter. */
export const DEFAULT_ENVIRONMENT_SIDEBAR_FILTER: EnvironmentSidebarFilter = 'all';

/** Default sidebar sort. */
export const DEFAULT_ENVIRONMENT_SIDEBAR_SORT_BY: EnvironmentSidebarSortBy = 'order';

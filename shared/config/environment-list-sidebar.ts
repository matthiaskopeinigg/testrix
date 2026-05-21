/** Sidebar filter for the environments profile list. */
export const ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS = ['all', 'empty', 'with-variables'] as const;

export type EnvironmentListSidebarFilter = (typeof ENVIRONMENT_LIST_SIDEBAR_FILTER_IDS)[number];

/** Presentation sort for the environments profile list (does not rewrite persisted order). */
export const ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS = ['order', 'name'] as const;

export type EnvironmentListSidebarSortBy = (typeof ENVIRONMENT_LIST_SIDEBAR_SORT_BY_IDS)[number];

/** Default list sidebar filter. */
export const DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER: EnvironmentListSidebarFilter = 'all';

/** Default list sidebar sort. */
export const DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY: EnvironmentListSidebarSortBy = 'order';

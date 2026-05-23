/** Sidebar filter for the collections tree. */
export const COLLECTION_LIST_SIDEBAR_FILTER_IDS = [
  'all',
  'favourites',
  'folders',
  'requests',
  'websockets',
] as const;

export type CollectionListSidebarFilter = (typeof COLLECTION_LIST_SIDEBAR_FILTER_IDS)[number];

/** Presentation sort for the collections tree (does not rewrite persisted order). */
export const COLLECTION_LIST_SIDEBAR_SORT_BY_IDS = ['order', 'name'] as const;

export type CollectionListSidebarSortBy = (typeof COLLECTION_LIST_SIDEBAR_SORT_BY_IDS)[number];

/** Default collections sidebar filter. */
export const DEFAULT_COLLECTION_LIST_SIDEBAR_FILTER: CollectionListSidebarFilter = 'all';

/** Default collections sidebar sort. */
export const DEFAULT_COLLECTION_LIST_SIDEBAR_SORT_BY: CollectionListSidebarSortBy = 'order';

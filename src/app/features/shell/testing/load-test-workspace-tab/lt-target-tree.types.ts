/** Kind filter for the load test target tree. */
export type LtTargetTreeFilter = 'all' | 'requests';

/** Sort mode for the load test target tree. */
export type LtTargetTreeSortBy = 'order' | 'name';

export const DEFAULT_LT_TARGET_TREE_FILTER: LtTargetTreeFilter = 'all';
export const DEFAULT_LT_TARGET_TREE_SORT_BY: LtTargetTreeSortBy = 'order';

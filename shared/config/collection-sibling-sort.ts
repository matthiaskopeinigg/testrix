/** Sibling sort modes for the collections tree (mirrors tx-tree `TxTreeSiblingSort`). */
export const COLLECTION_SIBLING_SORT_IDS = [
  'order',
  'priority',
  'orderThenPriority',
  'manual',
] as const;

export type CollectionSiblingSort = (typeof COLLECTION_SIBLING_SORT_IDS)[number];

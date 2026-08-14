import {
  TX_TREE_DEFAULT_CONFIG,
  type TxTreeConfig,
  type TxTreeDragPolicy,
  type TxTreeDropPolicy,
  type TxTreeExpansionConfig,
  type TxTreeSelectionConfig,
  type TxTreeSortConfig,
  type TxTreeVisualConfig,
} from './tx-tree.types';

export type TxTreeConfigPartial<T = unknown> = DeepPartial<TxTreeConfig<T>>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/**
 * Merges a partial tree config onto {@link TX_TREE_DEFAULT_CONFIG}.
 *
 * @param partial - Overrides for selection, expansion, drag, drop, sort, or visual groups.
 */
export function mergeTxTreeConfig<TMeta = unknown>(
  partial?: TxTreeConfigPartial<TMeta>,
): TxTreeConfig<TMeta> {
  if (!partial) {
    return TX_TREE_DEFAULT_CONFIG as TxTreeConfig<TMeta>;
  }

  return {
    ...TX_TREE_DEFAULT_CONFIG,
    ...partial,
    ariaLabel: partial.ariaLabel ?? TX_TREE_DEFAULT_CONFIG.ariaLabel,
    selection: mergeSelection<TMeta>(partial.selection),
    expansion: mergeExpansion(partial.expansion),
    drag: mergeDrag(partial.drag),
    drop: mergeDrop(partial.drop),
    sort: mergeSort(partial.sort),
    visual: mergeVisual(partial.visual),
  } as TxTreeConfig<TMeta>;
}

function mergeSelection<TMeta>(
  partial?: DeepPartial<TxTreeSelectionConfig<TMeta>>,
): TxTreeSelectionConfig<TMeta> {
  return { ...TX_TREE_DEFAULT_CONFIG.selection, ...partial } as TxTreeSelectionConfig<TMeta>;
}

function mergeExpansion(
  partial?: DeepPartial<TxTreeExpansionConfig>,
): TxTreeExpansionConfig {
  return { ...TX_TREE_DEFAULT_CONFIG.expansion, ...partial };
}

function mergeDrag<TMeta>(
  partial?: DeepPartial<TxTreeDragPolicy<TMeta>>,
): TxTreeDragPolicy<TMeta> {
  return { ...TX_TREE_DEFAULT_CONFIG.drag, ...partial } as TxTreeDragPolicy<TMeta>;
}

function mergeDrop<TMeta>(
  partial?: DeepPartial<TxTreeDropPolicy<TMeta>>,
): TxTreeDropPolicy<TMeta> {
  return {
    ...TX_TREE_DEFAULT_CONFIG.drop,
    ...partial,
    positions: partial?.positions ?? TX_TREE_DEFAULT_CONFIG.drop.positions,
  } as TxTreeDropPolicy<TMeta>;
}

function mergeSort(partial?: DeepPartial<TxTreeSortConfig>): TxTreeSortConfig {
  return { ...TX_TREE_DEFAULT_CONFIG.sort, ...partial };
}

function mergeVisual(partial?: DeepPartial<TxTreeVisualConfig>): TxTreeVisualConfig {
  return { ...TX_TREE_DEFAULT_CONFIG.visual, ...partial };
}

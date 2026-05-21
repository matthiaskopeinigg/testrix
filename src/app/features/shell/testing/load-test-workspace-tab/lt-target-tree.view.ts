import { applyTreeHttpMethodVisibility } from '@app/shared/components/tx-tree/tx-tree-http-method-visibility';
import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

import {
  filterLtTargetTree,
  filterLtTargetTreeByKind,
  stripWebsocketCollectionNodes,
} from './lt-target-tree.filter';
import { sortLtTargetTreeByName } from './lt-target-tree.sort';
import type { LtTargetTreeFilter, LtTargetTreeSortBy } from './lt-target-tree.types';

export interface LtTargetTreeViewOptions {
  readonly query: string;
  readonly filter: LtTargetTreeFilter;
  readonly sortBy: LtTargetTreeSortBy;
}

/** Applies sort, kind filter, search, and HTTP method badges for the target picker tree. */
export function applyLtTargetTreeView(
  nodes: readonly CollectionTreeNode[],
  options: LtTargetTreeViewOptions,
): CollectionTreeNode[] {
  let next = stripWebsocketCollectionNodes(nodes);

  if (options.sortBy === 'name') {
    next = sortLtTargetTreeByName(next);
  }

  next = filterLtTargetTreeByKind(next, options.filter);
  next = filterLtTargetTree(next, options.query);
  return applyTreeHttpMethodVisibility(next, 'tree-and-tab');
}

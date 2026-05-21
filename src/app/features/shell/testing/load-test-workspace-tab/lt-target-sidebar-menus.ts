import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { LtTargetTreeFilter, LtTargetTreeSortBy } from './lt-target-tree.types';

/** Filter menu entries for the load test target tree toolbar. */
export function buildLtTargetFilterMenuItems(active: LtTargetTreeFilter): TxContextMenuItem[] {
  return [
    filterOption('all', 'Folders and requests', 'layers', active),
    filterOption('requests', 'Requests only', 'http', active),
  ];
}

/** Sort menu entries for the load test target tree toolbar. */
export function buildLtTargetSortMenuItems(active: LtTargetTreeSortBy): TxContextMenuItem[] {
  return [
    sortOption('order', 'Collection order', 'list', active),
    sortOption('name', 'Name (A–Z)', 'tag', active),
  ];
}

function filterOption(
  id: LtTargetTreeFilter,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: LtTargetTreeFilter,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

function sortOption(
  id: LtTargetTreeSortBy,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: LtTargetTreeSortBy,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

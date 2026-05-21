import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import type { EnvironmentSidebarFilter, EnvironmentSidebarSortBy } from '@shared/config';

/** Filter menu entries for the environments sidebar toolbar. */
export function buildEnvironmentFilterMenuItems(
  active: EnvironmentSidebarFilter,
): TxContextMenuItem[] {
  return [
    filterOption('all', 'All items', 'layers', active),
    filterOption('folders', 'Folders only', 'folder', active),
    filterOption('variables', 'Variables only', 'hash', active),
  ];
}

/** Sort menu entries for the environments sidebar toolbar. */
export function buildEnvironmentSortMenuItems(
  active: EnvironmentSidebarSortBy,
): TxContextMenuItem[] {
  return [
    sortOption('order', 'Custom order', 'list', active),
    sortOption('name', 'Name (A–Z)', 'tag', active),
  ];
}

function filterOption(
  id: EnvironmentSidebarFilter,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: EnvironmentSidebarFilter,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

function sortOption(
  id: EnvironmentSidebarSortBy,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: EnvironmentSidebarSortBy,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

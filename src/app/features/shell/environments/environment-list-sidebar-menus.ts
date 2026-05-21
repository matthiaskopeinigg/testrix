import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import type {
  EnvironmentListSidebarFilter,
  EnvironmentListSidebarSortBy,
} from '@shared/config';

/** Filter menu entries for the environments profile list toolbar. */
export function buildEnvironmentListFilterMenuItems(
  active: EnvironmentListSidebarFilter,
): TxContextMenuItem[] {
  return [
    filterOption('all', 'All environments', 'layers', active),
    filterOption('with-variables', 'With variables', 'hash', active),
    filterOption('empty', 'Empty only', 'folderOpen', active),
  ];
}

/** Sort menu entries for the environments profile list toolbar. */
export function buildEnvironmentListSortMenuItems(
  active: EnvironmentListSidebarSortBy,
): TxContextMenuItem[] {
  return [
    sortOption('order', 'Custom order', 'list', active),
    sortOption('name', 'Name (A–Z)', 'tag', active),
  ];
}

function filterOption(
  id: EnvironmentListSidebarFilter,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: EnvironmentListSidebarFilter,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

function sortOption(
  id: EnvironmentListSidebarSortBy,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: EnvironmentListSidebarSortBy,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

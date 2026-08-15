import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

export const DATABASE_SIDEBAR_FILTER_IDS = ['all', 'folders', 'queries'] as const;

export type DatabaseSidebarFilter = (typeof DATABASE_SIDEBAR_FILTER_IDS)[number];

export const DATABASE_SIDEBAR_SORT_BY_IDS = [
  'saved',
  'name-asc',
  'name-desc',
  'date-new',
  'date-old',
] as const;

export type DatabaseSidebarSortBy = (typeof DATABASE_SIDEBAR_SORT_BY_IDS)[number];

export const DEFAULT_DATABASE_SIDEBAR_FILTER: DatabaseSidebarFilter = 'all';

export const DEFAULT_DATABASE_SIDEBAR_SORT_BY: DatabaseSidebarSortBy = 'saved';

/** Filter menu entries for the Database sidebar toolbar. */
export function buildDatabaseFilterMenuItems(
  kindFilter: DatabaseSidebarFilter,
  showSystemObjects = false,
): TxContextMenuItem[] {
  return [
    ...DATABASE_SIDEBAR_FILTER_IDS.map((id) => kindFilterOption(id, kindFilter)),
    { id: 'sep-system', label: '', separator: true },
    {
      id: 'show-system-objects',
      label: 'Show system objects',
      icon: 'layers',
      selected: showSystemObjects,
    },
  ];
}

/** Sort menu entries for the Database sidebar toolbar. */
export function buildDatabaseSortMenuItems(active: DatabaseSidebarSortBy): TxContextMenuItem[] {
  return DATABASE_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

export function isDatabaseKindFilterAction(actionId: string): actionId is DatabaseSidebarFilter {
  return (DATABASE_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

export function isDatabaseSortAction(actionId: string): actionId is DatabaseSidebarSortBy {
  return (DATABASE_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: DatabaseSidebarFilter,
  active: DatabaseSidebarFilter,
): TxContextMenuItem {
  const labels: Record<
    DatabaseSidebarFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All items', icon: 'layers' },
    folders: { label: 'Folders only', icon: 'folder' },
    queries: { label: 'Queries only', icon: 'database' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: DatabaseSidebarSortBy, active: DatabaseSidebarSortBy): TxContextMenuItem {
  const labels: Record<
    DatabaseSidebarSortBy,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    saved: { label: 'Saved order', icon: 'list' },
    'name-asc': { label: 'Name (A–Z)', icon: 'tag' },
    'name-desc': { label: 'Name (Z–A)', icon: 'tag' },
    'date-new': { label: 'Date modified (newest)', icon: 'clock' },
    'date-old': { label: 'Date modified (oldest)', icon: 'clock' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

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

export const DATABASE_CONNECTION_FILTER_PREFIX = 'connection:' as const;

export interface DatabaseConnectionFilterOption {
  readonly id: string;
  readonly name: string;
}

/** Filter menu entries for the Database sidebar toolbar. */
export function buildDatabaseFilterMenuItems(
  kindFilter: DatabaseSidebarFilter,
  showSystemObjects = false,
  connectionOptions: readonly DatabaseConnectionFilterOption[] = [],
  selectedConnectionIds: readonly string[] = [],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = [
    ...DATABASE_SIDEBAR_FILTER_IDS.map((id) => kindFilterOption(id, kindFilter)),
    { id: 'sep-system', label: '', separator: true },
    {
      id: 'show-system-objects',
      label: 'Show system objects',
      icon: 'layers',
      selected: showSystemObjects,
    },
  ];
  if (connectionOptions.length === 0) {
    return items;
  }
  const selected = new Set(selectedConnectionIds);
  return [
    ...items,
    { id: 'sep-connections', label: '', separator: true },
    ...connectionOptions.map((option) => ({
      id: connectionFilterActionId(option.id),
      label: option.name,
      icon: 'database' as const,
      selected: selected.has(option.id),
    })),
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

/** True when a filter-menu action toggles a connection id. */
export function isDatabaseConnectionFilterAction(actionId: string): boolean {
  return actionId.startsWith(DATABASE_CONNECTION_FILTER_PREFIX);
}

/** Connection id encoded in a filter-menu action, or null. */
export function parseDatabaseConnectionFilterAction(actionId: string): string | null {
  if (!isDatabaseConnectionFilterAction(actionId)) {
    return null;
  }
  const id = actionId.slice(DATABASE_CONNECTION_FILTER_PREFIX.length).trim();
  return id || null;
}

/** Encodes a connection id as a filter-menu action. */
export function connectionFilterActionId(connectionId: string): string {
  return `${DATABASE_CONNECTION_FILTER_PREFIX}${connectionId}`;
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

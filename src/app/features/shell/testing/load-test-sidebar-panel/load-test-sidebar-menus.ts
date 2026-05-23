import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  LOAD_TEST_SIDEBAR_FILTER_IDS,
  LOAD_TEST_SIDEBAR_SORT_BY_IDS,
  type LoadTestSidebarFilter,
  type LoadTestSidebarSortBy,
} from '@shared/config';

/** Filter menu entries for the load test sidebar toolbar. */
export function buildLoadTestFilterMenuItems(
  kindFilter: LoadTestSidebarFilter,
  tagFilter: readonly string[],
  allTags: readonly string[],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = LOAD_TEST_SIDEBAR_FILTER_IDS.map((id) =>
    kindFilterOption(id, kindFilter),
  );

  if (allTags.length > 0) {
    items.push({ id: 'sep-tags', label: '', separator: true });
    items.push({
      id: 'label-tags',
      label: 'Tags',
      icon: 'tag',
      disabled: true,
    });
    for (const tag of allTags) {
      items.push({
        id: `tag:${tag}`,
        label: tag,
        icon: 'tag',
        selected: tagFilter.some((active) => active.toLowerCase() === tag.toLowerCase()),
      });
    }
  }

  return items;
}

/** Sort menu entries for the load test sidebar toolbar. */
export function buildLoadTestSortMenuItems(active: LoadTestSidebarSortBy): TxContextMenuItem[] {
  return LOAD_TEST_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

/** Returns true when `actionId` is a load test kind filter id. */
export function isLoadTestKindFilterAction(actionId: string): actionId is LoadTestSidebarFilter {
  return (LOAD_TEST_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

/** Returns true when `actionId` is a load test sort id. */
export function isLoadTestSortAction(actionId: string): actionId is LoadTestSidebarSortBy {
  return (LOAD_TEST_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: LoadTestSidebarFilter,
  active: LoadTestSidebarFilter,
): TxContextMenuItem {
  const labels: Record<
    LoadTestSidebarFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All items', icon: 'layers' },
    folders: { label: 'Folders only', icon: 'folder' },
    'load-tests': { label: 'Load tests only', icon: 'zap' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: LoadTestSidebarSortBy, active: LoadTestSidebarSortBy): TxContextMenuItem {
  const labels: Record<LoadTestSidebarSortBy, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> =
    {
      saved: { label: 'Saved order', icon: 'list' },
      'name-asc': { label: 'Name (A–Z)', icon: 'tag' },
      'name-desc': { label: 'Name (Z–A)', icon: 'tag' },
      'date-new': { label: 'Date modified (newest)', icon: 'clock' },
      'date-old': { label: 'Date modified (oldest)', icon: 'clock' },
    };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

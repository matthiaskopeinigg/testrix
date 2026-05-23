import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  MOCK_SERVER_SIDEBAR_FILTER_IDS,
  MOCK_SERVER_SIDEBAR_SORT_BY_IDS,
  type MockServerSidebarFilter,
  type MockServerSidebarSortBy,
} from '@shared/config';

export function buildMockServerFilterMenuItems(
  kindFilter: MockServerSidebarFilter,
  tagFilter: readonly string[],
  allTags: readonly string[],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = MOCK_SERVER_SIDEBAR_FILTER_IDS.map((id) =>
    kindFilterOption(id, kindFilter),
  );
  if (allTags.length > 0) {
    items.push({ id: 'sep-tags', label: '', separator: true });
    items.push({ id: 'label-tags', label: 'Tags', icon: 'tag', disabled: true });
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

export function buildMockServerSortMenuItems(active: MockServerSidebarSortBy): TxContextMenuItem[] {
  return MOCK_SERVER_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

export function isMockServerKindFilterAction(actionId: string): actionId is MockServerSidebarFilter {
  return (MOCK_SERVER_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

export function isMockServerSortAction(actionId: string): actionId is MockServerSidebarSortBy {
  return (MOCK_SERVER_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: MockServerSidebarFilter,
  active: MockServerSidebarFilter,
): TxContextMenuItem {
  const labels: Record<MockServerSidebarFilter, string> = {
    all: 'All',
    folders: 'Folders only',
    endpoints: 'Endpoints only',
  };
  return { id, label: labels[id], selected: active === id };
}

function sortOption(id: MockServerSidebarSortBy, active: MockServerSidebarSortBy): TxContextMenuItem {
  const labels: Record<MockServerSidebarSortBy, string> = {
    saved: 'Saved order',
    'name-asc': 'Name A–Z',
    'name-desc': 'Name Z–A',
    'date-new': 'Newest first',
    'date-old': 'Oldest first',
  };
  return { id, label: labels[id], selected: active === id };
}

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  COLLECTION_LIST_SIDEBAR_FILTER_IDS,
  HTTP_METHOD_IDS,
  type CollectionListSidebarFilter,
  type CollectionListSidebarSortBy,
  type HttpMethodId,
} from '@shared/config';

/** Filter menu entries for the collections sidebar toolbar. */
export function buildCollectionListFilterMenuItems(
  kindFilter: CollectionListSidebarFilter,
  tagFilter: readonly string[],
  allTags: readonly string[],
  methodFilter: readonly HttpMethodId[],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = COLLECTION_LIST_SIDEBAR_FILTER_IDS.map((id) =>
    kindFilterOption(id, kindFilter),
  );

  if (kindFilter === 'requests') {
    items.push({ id: 'sep-methods', label: '', separator: true });
    items.push({
      id: 'label-methods',
      label: 'HTTP method',
      icon: 'http',
      disabled: true,
    });
    for (const method of HTTP_METHOD_IDS) {
      items.push({
        id: `method:${method}`,
        label: method,
        icon: 'http',
        selected: methodFilter.includes(method),
      });
    }
  }

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

/** Sort menu entries for the collections sidebar toolbar. */
export function buildCollectionListSortMenuItems(
  active: CollectionListSidebarSortBy,
): TxContextMenuItem[] {
  return [
    sortOption('order', 'Collection order', 'list', active),
    sortOption('name', 'Name (A–Z)', 'tag', active),
  ];
}

/** Returns true when `actionId` is a collection kind filter id. */
export function isCollectionListKindFilterAction(actionId: string): actionId is CollectionListSidebarFilter {
  return (COLLECTION_LIST_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: CollectionListSidebarFilter,
  active: CollectionListSidebarFilter,
): TxContextMenuItem {
  const labels: Record<CollectionListSidebarFilter, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> = {
    all: { label: 'All items', icon: 'layers' },
    favourites: { label: 'Favourites', icon: 'star' },
    folders: { label: 'Folders only', icon: 'folder' },
    requests: { label: 'Requests only', icon: 'http' },
    websockets: { label: 'WebSockets only', icon: 'interceptor' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(
  id: CollectionListSidebarSortBy,
  label: string,
  icon: TxContextMenuItem['icon'],
  active: CollectionListSidebarSortBy,
): TxContextMenuItem {
  return { id, label, icon, selected: active === id };
}

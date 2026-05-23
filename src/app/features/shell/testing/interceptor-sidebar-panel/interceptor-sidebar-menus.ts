import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  INTERCEPTOR_SIDEBAR_FILTER_IDS,
  INTERCEPTOR_SIDEBAR_SORT_BY_IDS,
  type InterceptorSidebarFilter,
  type InterceptorSidebarSortBy,
} from '@shared/config';

/** Builds kind-filter menu items for the interceptor sidebar. */
export function buildInterceptorFilterMenuItems(
  kindFilter: InterceptorSidebarFilter,
): TxContextMenuItem[] {
  return INTERCEPTOR_SIDEBAR_FILTER_IDS.map((id) => kindFilterOption(id, kindFilter));
}

/** Builds sort menu items for the interceptor sidebar. */
export function buildInterceptorSortMenuItems(active: InterceptorSidebarSortBy): TxContextMenuItem[] {
  return INTERCEPTOR_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

export function isInterceptorKindFilterAction(actionId: string): actionId is InterceptorSidebarFilter {
  return (INTERCEPTOR_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

export function isInterceptorSortAction(actionId: string): actionId is InterceptorSidebarSortBy {
  return (INTERCEPTOR_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: InterceptorSidebarFilter,
  active: InterceptorSidebarFilter,
): TxContextMenuItem {
  const labels: Record<
    InterceptorSidebarFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All items', icon: 'layers' },
    folders: { label: 'Folders only', icon: 'folder' },
    rules: { label: 'Rules only', icon: 'interceptor' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: InterceptorSidebarSortBy, active: InterceptorSidebarSortBy): TxContextMenuItem {
  const labels: Record<
    InterceptorSidebarSortBy,
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

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  HISTORY_SIDEBAR_SORT_BY_IDS,
  HISTORY_SIDEBAR_STATUS_FILTER_IDS,
  type HistorySidebarSortBy,
  type HistorySidebarStatusFilter,
} from '@shared/config';

export function buildHistoryFilterMenuItems(
  statusFilter: HistorySidebarStatusFilter,
): TxContextMenuItem[] {
  return HISTORY_SIDEBAR_STATUS_FILTER_IDS.map((id) => statusFilterOption(id, statusFilter));
}

export function buildHistorySortMenuItems(active: HistorySidebarSortBy): TxContextMenuItem[] {
  return HISTORY_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

export function isHistoryStatusFilterAction(
  actionId: string,
): actionId is HistorySidebarStatusFilter {
  return (HISTORY_SIDEBAR_STATUS_FILTER_IDS as readonly string[]).includes(actionId);
}

export function isHistorySortAction(actionId: string): actionId is HistorySidebarSortBy {
  return (HISTORY_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function statusFilterOption(
  id: HistorySidebarStatusFilter,
  active: HistorySidebarStatusFilter,
): TxContextMenuItem {
  const labels: Record<
    HistorySidebarStatusFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All requests', icon: 'layers' },
    success: { label: '2xx Success', icon: 'check' },
    redirect: { label: '3xx Redirect', icon: 'arrowRight' },
    'client-error': { label: '4xx Client error', icon: 'warning' },
    'server-error': { label: '5xx Server error', icon: 'error' },
    'no-response': { label: 'No response', icon: 'minus' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: HistorySidebarSortBy, active: HistorySidebarSortBy): TxContextMenuItem {
  const labels: Record<
    HistorySidebarSortBy,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    'date-new': { label: 'Newest first', icon: 'clock' },
    'date-old': { label: 'Oldest first', icon: 'clock' },
    'method-asc': { label: 'Method (A–Z)', icon: 'tag' },
    'method-desc': { label: 'Method (Z–A)', icon: 'tag' },
    'status-asc': { label: 'Status (low–high)', icon: 'list' },
    'status-desc': { label: 'Status (high–low)', icon: 'list' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

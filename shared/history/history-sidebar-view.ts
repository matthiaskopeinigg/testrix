import type { HistoryItem } from '../config/history.schema';
import type { HistorySidebarSortBy, HistorySidebarStatusFilter } from '../config/history-sidebar';
import { historyStatusTone } from './history-groups';

function historyItemStatusCode(item: HistoryItem): number | undefined {
  return item.snapshot?.status.code;
}

/** Filters history items by HTTP status bucket. */
export function filterHistoryByStatus(
  items: readonly HistoryItem[],
  filter: HistorySidebarStatusFilter,
): HistoryItem[] {
  if (filter === 'all') {
    return [...items];
  }
  return items.filter((item) => {
    const code = historyItemStatusCode(item);
    const tone = historyStatusTone(code);
    switch (filter) {
      case 'success':
        return tone === 'ok';
      case 'redirect':
        return tone === 'info';
      case 'client-error':
        return tone === 'warn';
      case 'server-error':
        return tone === 'err';
      case 'no-response':
        return code === undefined;
      default:
        return true;
    }
  });
}

/** Sorts history items for sidebar display. */
export function sortHistoryItems(
  items: readonly HistoryItem[],
  sortBy: HistorySidebarSortBy,
): HistoryItem[] {
  const copy = [...items];
  switch (sortBy) {
    case 'date-old':
      return copy.sort(
        (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
      );
    case 'method-asc':
      return copy.sort((a, b) => a.method.localeCompare(b.method));
    case 'method-desc':
      return copy.sort((a, b) => b.method.localeCompare(a.method));
    case 'status-asc':
      return copy.sort(
        (a, b) => (historyItemStatusCode(a) ?? -1) - (historyItemStatusCode(b) ?? -1),
      );
    case 'status-desc':
      return copy.sort(
        (a, b) => (historyItemStatusCode(b) ?? -1) - (historyItemStatusCode(a) ?? -1),
      );
    case 'date-new':
    default:
      return copy.sort(
        (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
      );
  }
}

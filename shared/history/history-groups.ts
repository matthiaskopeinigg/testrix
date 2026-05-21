import type { HistoryItem } from '../config/history.schema';

/** One day bucket in the history sidebar. */
export interface HistoryDayGroup {
  readonly dateKey: string;
  readonly displayLabel: string;
  collapsed: boolean;
  readonly entries: readonly HistoryItem[];
}

function formatGroupLabel(dateKey: string, now: Date): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Groups history items by calendar day (newest day first). */
export function groupHistoryItems(
  items: readonly HistoryItem[],
  collapsedByDate: Readonly<Record<string, boolean>> = {},
): HistoryDayGroup[] {
  const buckets = new Map<string, HistoryItem[]>();

  for (const item of items) {
    const dateKey = item.requestedAt.slice(0, 10);
    const list = buckets.get(dateKey) ?? [];
    list.push(item);
    buckets.set(dateKey, list);
  }

  const now = new Date();
  const dateKeys = [...buckets.keys()].sort((a, b) => {
    const aTs = new Date(buckets.get(a)![0]!.requestedAt).getTime();
    const bTs = new Date(buckets.get(b)![0]!.requestedAt).getTime();
    return bTs - aTs;
  });

  return dateKeys.map((dateKey) => {
    const entries = [...(buckets.get(dateKey) ?? [])].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
    return {
      dateKey,
      displayLabel: formatGroupLabel(dateKey, now),
      collapsed: collapsedByDate[dateKey] ?? false,
      entries,
    };
  });
}

/** Filters history items by label, method, or URL. */
export function filterHistoryItems(items: readonly HistoryItem[], query: string): HistoryItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...items];
  }
  return items.filter((item) => {
    const method = item.method.toLowerCase();
    const url = item.url.toLowerCase();
    return (
      item.label.toLowerCase().includes(trimmed) ||
      method.includes(trimmed) ||
      url.includes(trimmed)
    );
  });
}

/** Formats elapsed time between request start and response capture. */
export function formatHistoryElapsedMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Maps HTTP status code to sidebar / chip tone. */
export function historyStatusTone(
  code: number | undefined,
): 'ok' | 'warn' | 'err' | 'info' | 'unknown' {
  if (code === undefined || Number.isNaN(code)) {
    return 'unknown';
  }
  if (code >= 200 && code < 300) {
    return 'ok';
  }
  if (code >= 300 && code < 400) {
    return 'info';
  }
  if (code >= 400 && code < 500) {
    return 'warn';
  }
  if (code >= 500) {
    return 'err';
  }
  return 'unknown';
}

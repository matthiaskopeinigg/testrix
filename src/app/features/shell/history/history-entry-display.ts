import type { HistoryItem } from '@shared/config';
import { formatPrettyResponseBody, getResponseBodyText } from '@shared/http/response-body-display';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import { historyStatusTone } from '@shared/history';

/** Resolves the response snapshot stored on or referenced by a history item. */
export function resolveHistorySnapshot(
  item: HistoryItem,
  runsByRequestId?: Readonly<Record<string, { readonly runs: readonly HttpResponseSnapshot[] }>>,
): HttpResponseSnapshot | null {
  if (item.snapshot) {
    return item.snapshot;
  }
  if (!item.requestId || !item.snapshotId || !runsByRequestId) {
    return null;
  }
  const session = runsByRequestId[item.requestId];
  return session?.runs.find((r) => r.id === item.snapshotId) ?? null;
}

export function historyItemStatusCode(item: HistoryItem): number | undefined {
  const snap = item.snapshot;
  return snap?.status.code;
}

export function historyItemDurationMs(item: HistoryItem): number | undefined {
  return item.snapshot?.timing.totalMs;
}

export function formatHistoryByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatHistoryBodyPreview(snapshot: HttpResponseSnapshot | null): string {
  if (!snapshot) {
    return '';
  }
  return formatPrettyResponseBody(snapshot) || getResponseBodyText(snapshot);
}

export { historyStatusTone };

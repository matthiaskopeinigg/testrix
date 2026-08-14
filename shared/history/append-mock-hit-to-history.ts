import type { HistoryFile, HistoryItem } from '../config/history.schema';
import type { HttpResponseSnapshot } from '../http/outgoing-request.schema';
import type { ParsedMockRequest } from '../testing/mock-server-match';

function newId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

/**
 * Appends a mock server hit (matched or unmatched) to a history file.
 */
export function appendMockHitToHistory(
  file: HistoryFile,
  params: {
    readonly request: ParsedMockRequest;
    readonly snapshot: HttpResponseSnapshot;
    readonly matched: boolean;
    readonly endpointName?: string;
  },
): { readonly file: HistoryFile; readonly itemId: string } {
  const id = newId('hist');
  const prefix = params.matched ? 'MOCK' : 'MOCK ✕';
  const suffix = params.endpointName?.trim() || params.request.pathname;
  const label = `${prefix} ${params.request.method} ${suffix}`.trim();

  const headers = Object.entries(params.request.headers).map(([key, value]) => ({
    key,
    value,
  }));

  const item: HistoryItem = {
    id,
    label,
    method: params.request.method,
    url: params.request.url,
    requestedAt: params.snapshot.capturedAt,
    snapshotId: params.snapshot.id,
    snapshot: params.snapshot,
    request: {
      headers,
      queryParams: [],
      body: params.request.bodyText || undefined,
    },
    order: Date.now(),
  };

  return {
    file: {
      ...file,
      meta: { ...file.meta, updatedAt: new Date().toISOString() },
      items: [...file.items, item],
    },
    itemId: id,
  };
}

/**
 * Builds an HTTP response snapshot for a mock server response.
 */
export function buildMockResponseSnapshot(params: {
  readonly request: ParsedMockRequest;
  readonly statusCode: number;
  readonly responseText: string;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly durationMs: number;
  readonly matched: boolean;
  readonly endpointName?: string;
}): HttpResponseSnapshot {
  const headerRows = Object.entries(params.responseHeaders).map(([key, value]) => ({
    key,
    value,
  }));
  const contentType = params.responseHeaders['content-type'] ?? params.responseHeaders['Content-Type'];
  return {
    id: newId('snap'),
    capturedAt: new Date().toISOString(),
    label: params.matched
      ? `MOCK ${params.endpointName ?? ''}`.trim()
      : 'MOCK unmatched',
    requestSummary: {
      method: params.request.method,
      url: params.request.url,
      environmentId: null,
      requestId: undefined,
    },
    status: {
      code: params.statusCode,
      text: params.statusCode === 404 ? 'Not Found' : 'OK',
      ok: params.statusCode >= 200 && params.statusCode < 300,
    },
    timing: {
      totalMs: params.durationMs,
      dnsMs: 0,
      connectMs: 0,
      tlsMs: 0,
      ttfbMs: params.durationMs,
      downloadMs: 0,
    },
    size: {
      headersBytes: headerRows.reduce((n, h) => n + h.key.length + h.value.length, 0),
      bodyBytes: params.responseText.length,
    },
    headers: headerRows,
    redirects: [],
    body: {
      encoding: 'text',
      text: params.responseText,
      contentType,
      truncated: false,
    },
  };
}

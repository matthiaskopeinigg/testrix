import { z } from 'zod';

import { HTTP_METHODS, httpMethodSchema, type HttpMethod } from './collection-tree';
import { collectionCookieSchema } from './collection-folder';
import { httpRedirectHopSchema, httpTimingSchema } from './http-execute';
import { CONFIG_SCHEMA_VERSION } from './settings';

export const HISTORY_MAX_ENTRIES = 200;
export const HISTORY_BODY_MAX_CHARS = 32_768;
export const REQUEST_RUNS_MAX = 20;

export const SECRET_HEADER_NAMES = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
] as const;

export const historyHeaderSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type HistoryHeader = z.infer<typeof historyHeaderSchema>;

export const requestRunSnapshotSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  method: httpMethodSchema,
  url: z.string().default(''),
  status: z.number().int(),
  statusText: z.string().default(''),
  durationMs: z.number().default(0),
  sizeLabel: z.string().default(''),
  error: z.string().nullable().default(null),
  requestHeaders: z.array(historyHeaderSchema).default([]),
  requestBody: z.string().default(''),
  responseHeaders: z.array(historyHeaderSchema).default([]),
  responseBody: z.string().default(''),
  httpVersion: z.string().optional(),
  timing: httpTimingSchema.optional(),
  redirects: z.array(httpRedirectHopSchema).optional(),
  setCookies: z.array(collectionCookieSchema).optional(),
});

export type RequestRunSnapshot = z.infer<typeof requestRunSnapshotSchema>;

export const historyEntrySchema = requestRunSnapshotSchema.extend({
  requestId: z.string().min(1),
  requestName: z.string().default(''),
  workspaceId: z.string().default(''),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export const historyFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  entries: z.array(historyEntrySchema).default([]),
});

export type HistoryFile = z.infer<typeof historyFileSchema>;

export const DEFAULT_HISTORY_FILE: HistoryFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  entries: [],
};

export function parseHistoryFile(raw: unknown): HistoryFile {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const parsed = historyFileSchema.safeParse({
    schemaVersion: CONFIG_SCHEMA_VERSION,
    entries: Array.isArray(source['entries']) ? source['entries'] : [],
  });
  if (!parsed.success)
    return { ...DEFAULT_HISTORY_FILE };
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    entries: parsed.data.entries.slice(0, HISTORY_MAX_ENTRIES),
  };
}

const SECRET_HEADER_SET = new Set<string>(SECRET_HEADER_NAMES);

export function isSecretHeaderName(name: string): boolean {
  const key = name.trim().toLowerCase();
  if (SECRET_HEADER_SET.has(key))
    return true;
  if (key.includes('secret'))
    return true;
  return key.endsWith('-token') || key.endsWith('_token');
}

export function redactHeaders(headers: readonly HistoryHeader[]): HistoryHeader[] {
  return headers.map((header) =>
    isSecretHeaderName(header.key)
      ? { key: header.key, value: '••••' }
      : header,
  );
}

export function capBody(value: string, max = HISTORY_BODY_MAX_CHARS): string {
  if (value.length <= max)
    return value;
  return `${value.slice(0, max)}\n… [truncated]`;
}

export function redactSnapshot<T extends RequestRunSnapshot>(snapshot: T): T {
  return {
    ...snapshot,
    requestHeaders: redactHeaders(snapshot.requestHeaders),
    responseHeaders: redactHeaders(snapshot.responseHeaders),
    requestBody: capBody(snapshot.requestBody),
    responseBody: capBody(snapshot.responseBody),
  };
}

export function prependHistoryEntry(file: HistoryFile, entry: HistoryEntry): HistoryFile {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    entries: [redactSnapshot(entry), ...file.entries].slice(0, HISTORY_MAX_ENTRIES),
  };
}

export const historyGroupBySchema = z.enum(['day', 'method', 'status']);

export type HistoryGroupBy = z.infer<typeof historyGroupBySchema>;

export const HISTORY_GROUP_BY = historyGroupBySchema.options;

export const HISTORY_GROUP_BY_LABELS: Record<HistoryGroupBy, string> = {
  day: 'Day',
  method: 'Method',
  status: 'Status',
};

export const historyStatusClassSchema = z.enum(['ok', 'redirect', 'client', 'server', 'error']);

export type HistoryStatusClass = z.infer<typeof historyStatusClassSchema>;

export const HISTORY_STATUS_CLASSES = historyStatusClassSchema.options;

export const HISTORY_STATUS_CLASS_LABELS: Record<HistoryStatusClass, string> = {
  ok: '2xx',
  redirect: '3xx',
  client: '4xx',
  server: '5xx',
  error: 'Failed',
};

export interface HistoryQuery {
  readonly query: string;
  readonly methods: readonly HttpMethod[];
  readonly statusClasses: readonly HistoryStatusClass[];
}

export const DEFAULT_HISTORY_QUERY: HistoryQuery = {
  query: '',
  methods: [],
  statusClasses: [],
};

export interface HistoryGroup {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
}

/**
 * Maps a snapshot to a coarse status bucket used by History filters.
 */
export function historyStatusClass(status: number, error: string | null): HistoryStatusClass {
  if (error?.trim())
    return 'error';
  if (status >= 500)
    return 'server';
  if (status >= 400)
    return 'client';
  if (status >= 300)
    return 'redirect';
  if (status >= 200)
    return 'ok';
  return 'error';
}

/**
 * Returns Today / Yesterday / a short date for a history timestamp.
 */
export function historyDayLabel(iso: string, nowMs = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()))
    return 'Unknown';
  const now = new Date(nowMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const delta = Math.round((startToday - start) / 86_400_000);
  if (delta === 0)
    return 'Today';
  if (delta === 1)
    return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Filters history by search text, method, and status class.
 */
export function filterHistoryEntries(
  entries: readonly HistoryEntry[],
  query: HistoryQuery,
): HistoryEntry[] {
  const needle = query.query.trim().toLowerCase();
  const methods = new Set(query.methods);
  const classes = new Set(query.statusClasses);
  return entries.filter((entry) => {
    if (methods.size > 0 && !methods.has(entry.method))
      return false;
    if (classes.size > 0 && !classes.has(historyStatusClass(entry.status, entry.error)))
      return false;
    if (!needle)
      return true;
    const haystack = `${entry.url} ${entry.requestName} ${entry.method} ${entry.status}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Groups filtered history rows for the History sidebar.
 */
export function groupHistoryEntries(
  entries: readonly HistoryEntry[],
  groupBy: HistoryGroupBy,
  nowMs = Date.now(),
): HistoryGroup[] {
  if (groupBy === 'method')
    return groupByKeys(entries, (entry) => entry.method, HTTP_METHODS);
  if (groupBy === 'status') {
    return groupByKeys(
      entries,
      (entry) => historyStatusClass(entry.status, entry.error),
      HISTORY_STATUS_CLASSES,
      (id) => HISTORY_STATUS_CLASS_LABELS[id as HistoryStatusClass] ?? id,
    );
  }
  return groupByFirstSeen(entries, (entry) => historyDayLabel(entry.at, nowMs));
}

function groupByFirstSeen(
  entries: readonly HistoryEntry[],
  keyOf: (entry: HistoryEntry) => string,
): HistoryGroup[] {
  const groups = new Map<string, HistoryEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const id = keyOf(entry);
    const list = groups.get(id);
    if (list) {
      list.push(entry);
      continue;
    }
    groups.set(id, [entry]);
    order.push(id);
  }
  return order.map((id) => ({ id, label: id, entries: groups.get(id) ?? [] }));
}

function groupByKeys(
  entries: readonly HistoryEntry[],
  keyOf: (entry: HistoryEntry) => string,
  preferred: readonly string[],
  labelOf: (id: string) => string = (id) => id,
): HistoryGroup[] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const id = keyOf(entry);
    const list = groups.get(id);
    if (list) {
      list.push(entry);
      continue;
    }
    groups.set(id, [entry]);
  }
  const extra = [...groups.keys()].filter((id) => !preferred.includes(id)).sort();
  return [...preferred, ...extra]
    .filter((id) => groups.has(id))
    .map((id) => ({ id, label: labelOf(id), entries: groups.get(id) ?? [] }));
}

export function prependRequestRun(
  runs: readonly RequestRunSnapshot[],
  snapshot: RequestRunSnapshot,
): RequestRunSnapshot[] {
  return [redactSnapshot(snapshot), ...runs].slice(0, REQUEST_RUNS_MAX);
}

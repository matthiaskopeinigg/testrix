import type { CollectionDescribedKeyValueRow } from './collection-folder-settings.schema';
import type { CollectionFolderSettings } from './collection-folder-settings.schema';
import type { CollectionRequestHeaders } from './collection-request-settings.schema';
import type { HttpHeadersSettings, HttpKeyValueRow } from './http-settings.schema';

export type ResolvedRequestHeaderSource = 'global' | 'folder' | 'request';

export interface ResolvedRequestHeaderRow {
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
  readonly source: ResolvedRequestHeaderSource;
  readonly folderId?: string;
  readonly folderLabel?: string;
  readonly readOnly: boolean;
  readonly overrideKey?: string;
}

export interface ResolveCollectionRequestHeadersInput {
  readonly globalHeaders: HttpHeadersSettings;
  readonly ancestorFolders: readonly {
    readonly id: string;
    readonly label: string;
    readonly settings: CollectionFolderSettings;
  }[];
  readonly requestHeaders: CollectionRequestHeaders;
}

function headerKeyLower(key: string): string {
  return key.trim().toLowerCase();
}

function folderRowsToResolved(
  rows: readonly CollectionDescribedKeyValueRow[],
  folderId: string,
  folderLabel: string,
): ResolvedRequestHeaderRow[] {
  const out: ResolvedRequestHeaderRow[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    out.push({
      key,
      value: row.value,
      enabled: true,
      source: 'folder',
      folderId,
      folderLabel,
      readOnly: true,
      overrideKey: key,
    });
  }
  return out;
}

function globalRowsToResolved(rows: readonly HttpKeyValueRow[]): ResolvedRequestHeaderRow[] {
  const out: ResolvedRequestHeaderRow[] = [];
  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    out.push({
      key,
      value: row.value,
      enabled: true,
      source: 'global',
      readOnly: true,
      overrideKey: key,
    });
  }
  return out;
}

/**
 * Merges global defaults, ancestor folder headers, request rows, and overrides for display/Send.
 */
export function resolveCollectionRequestHeaders(
  input: ResolveCollectionRequestHeadersInput,
): ResolvedRequestHeaderRow[] {
  const merged = new Map<string, ResolvedRequestHeaderRow>();

  if (input.globalHeaders.applyDefaultHeaders) {
    for (const row of globalRowsToResolved(input.globalHeaders.rows)) {
      merged.set(headerKeyLower(row.key), row);
    }
  }

  for (const folder of input.ancestorFolders) {
    for (const row of folderRowsToResolved(
      folder.settings.headers,
      folder.id,
      folder.label,
    )) {
      const lower = headerKeyLower(row.key);
      merged.set(lower, row);
    }
  }

  const overrides = input.requestHeaders.overrides ?? {};

  for (const [overrideKey, patch] of Object.entries(overrides)) {
    const lower = headerKeyLower(overrideKey);
    const existing = merged.get(lower);
    if (!existing) {
      continue;
    }
    const enabled = patch.enabled ?? existing.enabled;
    if (!enabled) {
      merged.delete(lower);
      continue;
    }
    merged.set(lower, {
      ...existing,
      value: patch.value ?? existing.value,
      enabled: true,
    });
  }

  for (const row of input.requestHeaders.rows) {
    if (!row.enabled) {
      continue;
    }
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    merged.set(headerKeyLower(key), {
      key,
      value: row.value,
      enabled: true,
      source: 'request',
      readOnly: false,
    });
  }

  return [...merged.values()];
}

/** Inherited header row for the request Headers panel (global + folders, not request rows). */
export interface InheritedRequestHeaderRow {
  readonly key: string;
  readonly value: string;
  /** When false, the header is excluded from the outgoing request. */
  readonly enabled: boolean;
  readonly source: ResolvedRequestHeaderSource;
  readonly folderId?: string;
  readonly folderLabel?: string;
  readonly overrideKey: string;
}

/**
 * Lists inherited headers for the Headers tab. Rows replaced by an enabled request header
 * with the same key are omitted. Disabled rows remain visible with {@link enabled} false.
 */
export function listInheritedRequestHeaderRows(
  input: ResolveCollectionRequestHeadersInput,
): InheritedRequestHeaderRow[] {
  const merged = new Map<string, ResolvedRequestHeaderRow>();

  if (input.globalHeaders.applyDefaultHeaders) {
    for (const row of globalRowsToResolved(input.globalHeaders.rows)) {
      merged.set(headerKeyLower(row.key), row);
    }
  }

  for (const folder of input.ancestorFolders) {
    for (const row of folderRowsToResolved(
      folder.settings.headers,
      folder.id,
      folder.label,
    )) {
      merged.set(headerKeyLower(row.key), row);
    }
  }

  const overrides = input.requestHeaders.overrides ?? {};
  const requestKeys = new Set(
    input.requestHeaders.rows
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => headerKeyLower(row.key)),
  );

  const out: InheritedRequestHeaderRow[] = [];

  for (const row of merged.values()) {
    const lower = headerKeyLower(row.key);
    if (requestKeys.has(lower)) {
      continue;
    }

    const overrideKey = row.overrideKey ?? row.key;
    const patch = overrides[overrideKey] ?? overrides[row.key];
    const enabled = patch?.enabled !== false;

    out.push({
      key: row.key,
      value: patch?.value ?? row.value,
      enabled,
      source: row.source,
      folderId: row.folderId,
      folderLabel: row.folderLabel,
      overrideKey,
    });
  }

  return out;
}

/** Builds a flat header map for outbound requests (enabled rows only). */
export function resolvedHeadersToMap(
  rows: readonly ResolvedRequestHeaderRow[],
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (!row.enabled) {
      continue;
    }
    const key = row.key.trim();
    if (!key) {
      continue;
    }
    result[key] = row.value;
  }
  return result;
}

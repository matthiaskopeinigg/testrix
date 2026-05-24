import type { CollectionsFile } from '../../config/collections.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
} from '../../config/collection-request-settings.schema';
import type { HttpMethodId } from '../../config/http-settings.schema';
import { createHttpKeyValueRow } from '../../config/http-settings.schema';
import { importMetaNow, newImportId } from '../import-ids';

const MAX_ENTRIES = 500;
const MAX_LABEL_CHARS = 96;

const METHOD_KEYS = ['http_method', 'request_method', 'method', 'verb'] as const;
const URL_KEYS = ['url', 'request_url', 'uri', 'request_uri', 'path', 'request_path'] as const;
const BODY_KEYS = ['request_body', 'body', 'payload', 'post_data'] as const;
const HEADER_KEYS = ['request_headers', 'headers'] as const;
const LABEL_KEYS = ['summary', 'operation_id', 'operationId', 'name'] as const;
const MESSAGE_KEYS = ['message', 'full_message', 'short_message'] as const;

const HTTP_METHODS = new Set<HttpMethodId>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

const ACCESS_LOG_RE =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)(?:\s+HTTP\/[\d.]+)?/i;

type NormalizedMessage = Record<string, unknown>;

function parseMethod(method: unknown): HttpMethodId {
  const m = String(method ?? 'GET').toUpperCase();
  return HTTP_METHODS.has(m as HttpMethodId) ? (m as HttpMethodId) : 'GET';
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim().replace(/,\s*$/, '');
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseNdjsonLines(raw: string): Record<string, unknown>[] {
  const lines = stripBom(raw).split('\n');
  const objects: Record<string, unknown>[] = [];
  for (const line of lines) {
    const obj = parseJsonLine(line);
    if (obj) {
      objects.push(obj);
    }
  }
  return objects;
}

function flattenGelfFields(record: Record<string, unknown>): NormalizedMessage {
  const normalized: NormalizedMessage = { ...record };
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('_') && key.length > 1) {
      const flatKey = key.slice(1);
      if (!(flatKey in normalized)) {
        normalized[flatKey] = value;
      }
    }
  }
  return normalized;
}

function mergeFieldsSubObject(record: Record<string, unknown>): NormalizedMessage {
  const fields = record['fields'];
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return flattenGelfFields(record);
  }
  return flattenGelfFields({ ...record, ...(fields as Record<string, unknown>) });
}

/** Normalizes a Graylog NDJSON or GELF message into a flat field map. */
export function normalizeGraylogMessage(record: Record<string, unknown>): NormalizedMessage {
  return mergeFieldsSubObject(record);
}

function lookupField(record: NormalizedMessage, keys: readonly string[]): unknown {
  const lowerMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lowerMap.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const value = lowerMap.get(key.toLowerCase());
    if (value != null && String(value).trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function parseHeaders(value: unknown): ReturnType<typeof createHttpKeyValueRow>[] {
  if (!value) {
    return [];
  }
  let headersObj: Record<string, unknown> | null = null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        headersObj = parsed as Record<string, unknown>;
      }
    } catch {
      return [];
    }
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    headersObj = value as Record<string, unknown>;
  }
  if (!headersObj) {
    return [];
  }
  return Object.entries(headersObj)
    .filter(([key]) => key.trim().length > 0 && !key.startsWith(':'))
    .map(([key, val]) =>
      createHttpKeyValueRow({
        key,
        value: String(val ?? ''),
      }),
    );
}

function messageText(record: NormalizedMessage): string {
  for (const key of MESSAGE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function parseAccessLogFallback(text: string): { method: HttpMethodId; url: string } | null {
  const match = ACCESS_LOG_RE.exec(text);
  if (!match) {
    return null;
  }
  const method = parseMethod(match[1]);
  const path = match[2] ?? '';
  if (!path || path === '-') {
    return null;
  }
  return { method, url: path };
}

function buildLabel(
  record: NormalizedMessage,
  method: HttpMethodId,
  url: string,
  index: number,
): string {
  for (const key of LABEL_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().slice(0, MAX_LABEL_CHARS);
    }
  }
  if (url) {
    const label = `${method} ${url}`.trim();
    if (label.length > 0) {
      return label.slice(0, MAX_LABEL_CHARS);
    }
  }
  const text = messageText(record);
  if (text) {
    return text.slice(0, MAX_LABEL_CHARS);
  }
  return `Graylog ${index + 1}`;
}

export interface ExtractedHttpRequest {
  readonly method: HttpMethodId;
  readonly url: string;
  readonly body: string;
  readonly headers: ReturnType<typeof createHttpKeyValueRow>[];
  readonly label: string;
}

/** Extracts HTTP request data from a normalized Graylog/GELF message. */
export function extractHttpRequestFromGraylogMessage(
  record: Record<string, unknown>,
  index = 0,
): ExtractedHttpRequest | null {
  const normalized = normalizeGraylogMessage(record);
  let method = parseMethod(lookupField(normalized, METHOD_KEYS));
  let url = String(lookupField(normalized, URL_KEYS) ?? '').trim();
  const body = String(lookupField(normalized, BODY_KEYS) ?? '').trim();
  const headers = parseHeaders(lookupField(normalized, HEADER_KEYS));

  if (!url) {
    const fallback = parseAccessLogFallback(messageText(normalized));
    if (fallback) {
      method = fallback.method;
      url = fallback.url;
    }
  }

  if (!url) {
    return null;
  }

  return {
    method,
    url,
    body,
    headers,
    label: buildLabel(normalized, method, url, index),
  };
}

/** Returns true when a JSON object looks like a Graylog or GELF message. */
export function looksLikeGraylogMessage(record: Record<string, unknown>): boolean {
  const isGelf =
    (record['version'] === '1.1' && typeof record['host'] === 'string') ||
    typeof record['short_message'] === 'string';
  const isGraylogNdjson =
    record['timestamp'] != null && (record['message'] != null || record['source'] != null);
  return isGelf || isGraylogNdjson;
}

function parseGraylogObjects(raw: string): Record<string, unknown>[] {
  const trimmed = stripBom(raw).trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return [parsed as Record<string, unknown>];
    }
  } catch {
    // Fall through to NDJSON parsing.
  }

  return parseNdjsonLines(raw);
}

/** Converts Graylog NDJSON or GELF exports into a Testrix collections file. */
export function importGraylog(raw: string): CollectionsFile {
  const messages = parseGraylogObjects(raw);
  const nodes: CollectionsFile['nodes'] = [];
  const max = Math.min(messages.length, MAX_ENTRIES);

  for (let i = 0; i < max; i++) {
    const extracted = extractHttpRequestFromGraylogMessage(messages[i]!, i);
    if (!extracted) {
      continue;
    }

    const settings = enrichCollectionRequestSettings(createDefaultCollectionRequestSettings());
    settings.headers.rows = extracted.headers;
    if (extracted.body) {
      settings.body = { mode: 'text', raw: extracted.body };
    }

    nodes.push({
      id: newImportId(),
      kind: 'request',
      label: extracted.label,
      order: nodes.length,
      method: extracted.method,
      url: extracted.url,
      settings,
    });
  }

  if (nodes.length === 0) {
    throw new Error('No HTTP requests found in Graylog export.');
  }

  return {
    schemaVersion: 1,
    meta: importMetaNow(),
    nodes,
  };
}

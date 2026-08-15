import { createHttpKeyValueRow, type HttpMethodId } from '../config/http-settings.schema';
import type { CollectionRequestSettings } from '../config/collection-request-settings.schema';
import { inferHttpBodySyntaxModeFromHeaders } from '../http/http-body-editor-language';

import {
  buildCollectionBodyFromCapture,
  buildCollectionSettingsPatchFromCapture,
  captureEntryRequestLabel,
  coerceCaptureHttpMethod,
} from './capture-to-request';
import { captureBodyPreviewContent } from './capture-format';
import type { CaptureHeaderPair, CaptureLogEntry } from './capture-log-entry.schema';
import {
  createDefaultMockRuleMatcher,
  createDefaultMockServerEndpoint,
  type MockServerEndpoint,
} from './mock-server.schema';

/** RFC 2616 hop-by-hop headers (plus Content-Length) stripped when generating requests. */
export const CAPTURE_HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
] as const;

const HOP_BY_HOP = new Set<string>(CAPTURE_HOP_BY_HOP_HEADERS);

export interface CaptureGeneratedRequest {
  readonly method: HttpMethodId;
  readonly url: string;
  readonly label: string;
  readonly settings: Partial<CollectionRequestSettings>;
}

/**
 * Returns a new opaque id for generated capture artifacts.
 */
function newGenerateId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `cap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Parses pathname from a captured URL, falling back to the raw path.
 */
export function captureEntryPathname(url: string): string {
  const trimmed = url.trim() || '/';
  try {
    return new URL(trimmed).pathname || '/';
  } catch {
    const withoutQuery = trimmed.split('?')[0] ?? trimmed;
    if (!withoutQuery) {
      return '/';
    }
    return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  }
}

/**
 * Method + pathname key used to dedupe capture rows.
 */
export function captureMethodPathKey(entry: CaptureLogEntry): string {
  return `${coerceCaptureHttpMethod(entry.method)} ${captureEntryPathname(entry.url)}`;
}

/**
 * Keeps the last entry for each method+path pair.
 */
export function dedupeCaptureEntriesByMethodPath(
  entries: readonly CaptureLogEntry[],
): CaptureLogEntry[] {
  const map = new Map<string, CaptureLogEntry>();
  for (const entry of entries) {
    map.set(captureMethodPathKey(entry), entry);
  }
  return [...map.values()];
}

/**
 * Drops hop-by-hop headers from a capture header list.
 */
export function stripHopByHopCaptureHeaders(
  headers: readonly CaptureHeaderPair[],
): CaptureHeaderPair[] {
  return headers.filter((header) => !HOP_BY_HOP.has(header.key.trim().toLowerCase()));
}

function withStrippedRequestHeaders(entry: CaptureLogEntry): CaptureLogEntry {
  return {
    ...entry,
    requestHeaders: stripHopByHopCaptureHeaders(entry.requestHeaders),
    responseHeaders: stripHopByHopCaptureHeaders(entry.responseHeaders),
  };
}

/**
 * Builds collection request drafts from selected capture rows (deduped).
 */
export function generateCollectionRequestsFromCapture(
  entries: readonly CaptureLogEntry[],
): CaptureGeneratedRequest[] {
  return dedupeCaptureEntriesByMethodPath(entries).map((raw) => {
    const entry = withStrippedRequestHeaders(raw);
    const method = coerceCaptureHttpMethod(entry.method);
    const url = (entry.url || '').trim() || '/';
    return {
      method,
      url,
      label: captureEntryRequestLabel(entry),
      settings: buildCollectionSettingsPatchFromCapture(entry),
    };
  });
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function contentTypeFromHeaders(headers: readonly CaptureHeaderPair[]): string {
  const row = headers.find((header) => header.key.trim().toLowerCase() === 'content-type');
  return row?.value?.trim() || 'application/json';
}

function originFromCapture(entries: readonly CaptureLogEntry[]): string {
  for (const entry of entries) {
    try {
      return new URL(entry.url).origin;
    } catch {
      continue;
    }
  }
  return 'https://api.example.com';
}

function mediaExample(body: string, contentType: string): Record<string, unknown> {
  const example = contentType.includes('json') ? tryParseJson(body) : body;
  return {
    [contentType]: {
      example,
    },
  };
}

/**
 * Builds an OpenAPI 3.0.3 JSON document from captured traffic.
 */
export function generateOpenApiFromCapture(
  entries: readonly CaptureLogEntry[],
  title = 'Captured API',
): string {
  const unique = dedupeCaptureEntriesByMethodPath(entries).map(withStrippedRequestHeaders);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const entry of unique) {
    const method = coerceCaptureHttpMethod(entry.method).toLowerCase();
    const pathname = captureEntryPathname(entry.url);
    const pathItem = paths[pathname] ?? {};
    const requestText = captureBodyPreviewContent(
      entry.requestHeaders,
      entry.requestBody,
      entry.requestBodyIsBinary,
    );
    const responseText = captureBodyPreviewContent(
      entry.responseHeaders,
      entry.responseBody,
      entry.responseBodyIsBinary,
    );
    const status = entry.statusCode && entry.statusCode >= 100 ? String(entry.statusCode) : '200';
    const operation: Record<string, unknown> = {
      summary: `${coerceCaptureHttpMethod(entry.method)} ${pathname}`,
      operationId: `${method}${pathname.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      responses: {
        [status]: {
          description: 'Captured response',
          content: mediaExample(responseText, contentTypeFromHeaders(entry.responseHeaders)),
        },
      },
    };
    if (requestText.trim() && method !== 'get' && method !== 'head') {
      operation['requestBody'] = {
        content: mediaExample(requestText, contentTypeFromHeaders(entry.requestHeaders)),
      };
    }
    pathItem[method] = operation;
    paths[pathname] = pathItem;
  }

  return JSON.stringify(
    {
      openapi: '3.0.3',
      info: { title, version: '1.0.0' },
      servers: [{ url: originFromCapture(unique) }],
      paths,
    },
    null,
    2,
  );
}

function mockBodyFromCapture(
  headers: readonly CaptureHeaderPair[],
  body: string,
  isBinary: boolean,
): MockServerEndpoint['response']['body'] {
  if (!body.trim()) {
    return { mode: 'none' };
  }
  if (isBinary) {
    return {
      mode: 'binary',
      source: 'inline',
      contentBase64: body,
      contentType: contentTypeFromHeaders(headers) || 'application/octet-stream',
    };
  }
  const text = captureBodyPreviewContent(headers, body, isBinary);
  const mode = inferHttpBodySyntaxModeFromHeaders(headers, body, isBinary);
  switch (mode) {
    case 'json':
      return { mode: 'json', raw: text };
    case 'xml':
      return { mode: 'xml', raw: text };
    case 'html':
      return { mode: 'html', raw: text };
    case 'graphql':
      return { mode: 'graphql', query: text, variables: '{}' };
    default:
      return { mode: 'text', raw: text };
  }
}

/**
 * Builds mock server endpoints from captured traffic (one per unique method+path).
 */
export function generateMockEndpointsFromCapture(
  entries: readonly CaptureLogEntry[],
  now = new Date().toISOString(),
): MockServerEndpoint[] {
  return dedupeCaptureEntriesByMethodPath(entries).map((raw) => {
    const entry = withStrippedRequestHeaders(raw);
    const id = newGenerateId();
    const method = coerceCaptureHttpMethod(entry.method);
    const pathname = captureEntryPathname(entry.url);
    const endpoint = createDefaultMockServerEndpoint(id, `${method} ${pathname}`, now);
    const matcher = createDefaultMockRuleMatcher(`${id}-matcher`);
    return {
      ...endpoint,
      matchers: [
        {
          ...matcher,
          methods: [method],
          path: { mode: 'exact', value: pathname, ignoreQuery: true },
        },
      ],
      response: {
        statusCode: entry.statusCode && entry.statusCode >= 100 ? entry.statusCode : 200,
        headers: stripHopByHopCaptureHeaders(entry.responseHeaders).map((header) =>
          createHttpKeyValueRow({ key: header.key, value: header.value, enabled: true }),
        ),
        body: mockBodyFromCapture(
          entry.responseHeaders,
          entry.responseBody ?? '',
          entry.responseBodyIsBinary,
        ),
        latencyMs: Math.max(0, Math.round(entry.timeMs ?? 0)),
      },
    };
  });
}

export { buildCollectionBodyFromCapture };

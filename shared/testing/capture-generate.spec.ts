import { describe, expect, it } from 'vitest';

import type { CaptureLogEntry } from './capture-log-entry.schema';
import {
  captureEntryPathname,
  captureMethodPathKey,
  dedupeCaptureEntriesByMethodPath,
  generateCollectionRequestsFromCapture,
  generateMockEndpointsFromCapture,
  generateOpenApiFromCapture,
  stripHopByHopCaptureHeaders,
} from './capture-generate';

function sampleEntry(overrides: Partial<CaptureLogEntry> = {}): CaptureLogEntry {
  return {
    id: 'e1',
    captureItemId: 's1',
    method: 'POST',
    url: 'https://api.example.com/v1/items',
    at: '2020-01-01T00:00:00.000Z',
    statusCode: 201,
    timeMs: 42,
    requestHeaders: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Connection', value: 'keep-alive' },
    ],
    responseHeaders: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Transfer-Encoding', value: 'chunked' },
    ],
    requestBody: '{"id":1}',
    responseBody: '{"ok":true}',
    requestBodyTruncated: false,
    requestBodyIsBinary: false,
    responseBodyTruncated: false,
    responseBodyIsBinary: false,
    ...overrides,
  };
}

describe('capture-generate', () => {
  it('strips hop-by-hop headers', () => {
    const headers = stripHopByHopCaptureHeaders(sampleEntry().requestHeaders);
    expect(headers.map((h) => h.key)).toEqual(['Content-Type']);
  });

  it('dedupes by method and pathname keeping the last row', () => {
    const first = sampleEntry({ id: 'a', requestBody: '{"id":1}' });
    const second = sampleEntry({ id: 'b', requestBody: '{"id":2}' });
    const unique = dedupeCaptureEntriesByMethodPath([first, second]);
    expect(unique).toHaveLength(1);
    expect(unique[0]?.id).toBe('b');
    expect(captureMethodPathKey(first)).toBe('POST /v1/items');
    expect(captureEntryPathname('https://api.example.com/v1/items?x=1')).toBe('/v1/items');
  });

  it('generates collection drafts without hop-by-hop headers', () => {
    const drafts = generateCollectionRequestsFromCapture([sampleEntry()]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.method).toBe('POST');
    const keys = drafts[0]?.settings.headers?.rows.map((row) => row.key) ?? [];
    expect(keys).toContain('Content-Type');
    expect(keys.some((key) => key.toLowerCase() === 'connection')).toBe(false);
  });

  it('generates OpenAPI JSON with paths and examples', () => {
    const spec = JSON.parse(generateOpenApiFromCapture([sampleEntry()])) as {
      openapi: string;
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/v1/items']?.['post']?.responses['201']).toBeTruthy();
  });

  it('generates mock endpoints from captured status and body', () => {
    const endpoints = generateMockEndpointsFromCapture([sampleEntry()], '2020-01-01T00:00:00.000Z');
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]?.response.statusCode).toBe(201);
    expect(endpoints[0]?.matchers[0]?.methods).toEqual(['POST']);
    expect(endpoints[0]?.matchers[0]?.path.value).toBe('/v1/items');
    expect(endpoints[0]?.response.body.mode).toBe('json');
  });
});

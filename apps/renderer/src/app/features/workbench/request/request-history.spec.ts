import { describe, expect, it } from 'vitest';

import {
  applyQueryToUrl,
  parseQueryParams,
  requestResponseTabSlideDir,
  requestSectionSlideDir,
  syncPathParams,
} from '@testrix/contracts';
import { prependHistoryEntry, parseHistoryFile } from '@testrix/contracts';

describe('request url path-param sync', () => {
  it('keeps path values when the URL still has the token', () => {
    const rows = syncPathParams('/pets/:id', [
      { id: 'p', enabled: true, key: 'id', value: '12', description: '' },
    ]);
    expect(rows[0]?.value).toBe('12');
  });

  it('rewrites the query string from the params table', () => {
    expect(applyQueryToUrl('https://api.local/x?old=1', [
      { id: 'q', enabled: true, key: 'limit', value: '10', description: '' },
    ])).toBe('https://api.local/x?limit=10');
    expect(parseQueryParams('https://api.local/x?limit=10')[0]?.key).toBe('limit');
  });
});

describe('request section slide direction', () => {
  it('moves right toward later sections', () => {
    expect(requestSectionSlideDir('overview', 'headers')).toBe('right');
    expect(requestSectionSlideDir('scripts', 'params')).toBe('left');
  });
});

describe('response tab slide direction', () => {
  it('moves right toward later response tabs', () => {
    expect(requestResponseTabSlideDir('pretty', 'timeline')).toBe('right');
    expect(requestResponseTabSlideDir('diff', 'preview')).toBe('left');
  });
});

describe('history append', () => {
  it('prepends a redacted entry onto history.json', () => {
    const next = prependHistoryEntry(parseHistoryFile({ entries: [] }), {
      id: 'h1',
      at: '2026-09-17T00:00:00.000Z',
      method: 'POST',
      url: 'https://api.local/login',
      status: 200,
      statusText: 'OK',
      durationMs: 20,
      sizeLabel: '2 B',
      error: null,
      requestHeaders: [{ key: 'Authorization', value: 'secret' }],
      requestBody: '{}',
      responseHeaders: [],
      responseBody: 'ok',
      requestId: 'http-1',
      requestName: 'Login',
      workspaceId: 'ws_1',
    });
    expect(next.entries[0]?.requestHeaders[0]?.value).toBe('••••');
    expect(next.entries[0]?.requestId).toBe('http-1');
  });
});

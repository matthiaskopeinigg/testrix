import { describe, expect, it } from 'vitest';

import type { HttpResponseSnapshot } from './outgoing-request.schema';
import { compareResponseSnapshots, prepareBodyForDiff } from './response-diff';

function snapshot(partial: Partial<HttpResponseSnapshot> & Pick<HttpResponseSnapshot, 'id'>): HttpResponseSnapshot {
  return {
    capturedAt: '2026-01-01T00:00:00.000Z',
    requestSummary: { method: 'GET', url: 'https://example.com' },
    status: { code: 200, text: 'OK', ok: true },
    timing: { totalMs: 10 },
    size: { headersBytes: 0, bodyBytes: 0 },
    headers: [],
    redirects: [],
    body: { encoding: 'text', text: '{}' },
    ...partial,
  };
}

describe('compareResponseSnapshots', () => {
  it('reports pass when status, headers, and JSON body match', () => {
    const a = snapshot({
      id: 'a',
      body: { encoding: 'text', text: '{"ok":true}' },
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    });
    const b = snapshot({
      id: 'b',
      body: { encoding: 'text', text: '{"ok":true}' },
      headers: [{ key: 'Content-Type', value: 'application/json' }],
    });

    const result = compareResponseSnapshots(a, b);
    expect(result.summary.pass).toBe(true);
    expect(result.bodyMode).toBe('json');
  });

  it('detects status and header changes', () => {
    const a = snapshot({ id: 'a', status: { code: 200, text: 'OK', ok: true } });
    const b = snapshot({ id: 'b', status: { code: 404, text: 'Not Found', ok: false } });

    const result = compareResponseSnapshots(a, b);
    expect(result.summary.pass).toBe(false);
    expect(result.summary.statusChanged).toBe(true);
  });

  it('splits minified HTML into multiple diff lines', () => {
    const a = snapshot({
      id: 'a',
      body: { encoding: 'text', text: '<html><head></head><body>a</body></html>', contentType: 'text/html' },
    });
    const b = snapshot({
      id: 'b',
      body: { encoding: 'text', text: '<html><head></head><body>b</body></html>', contentType: 'text/html' },
    });

    const result = compareResponseSnapshots(a, b);
    expect(result.lineHunks.length).toBeGreaterThan(2);
  });

  it('uses structural json path counts when normalize JSON is enabled', () => {
    const a = snapshot({
      id: 'a',
      body: {
        encoding: 'text',
        text: '{"token":{"accessToken":"old","accessExpiresIn":652}}',
      },
    });
    const b = snapshot({
      id: 'b',
      body: {
        encoding: 'text',
        text: '{"token":{"accessToken":"new","accessExpiresIn":899}}',
      },
    });

    const result = compareResponseSnapshots(a, b, { normalizeJson: true });
    expect(result.bodyMode).toBe('text');
    expect(result.lineHunks.length).toBeGreaterThan(0);
    expect(result.jsonPaths.some((p) => p.path.includes('accessToken'))).toBe(true);
    expect(result.summary.bodyChanges).toBe(result.jsonPaths.length);
  });

  it('produces line hunks for non-JSON text bodies', () => {
    const a = snapshot({ id: 'a', body: { encoding: 'text', text: 'line one\n' } });
    const b = snapshot({ id: 'b', body: { encoding: 'text', text: 'line two\n' } });

    const result = compareResponseSnapshots(a, b);
    expect(result.bodyMode).toBe('text');
    expect(result.lineHunks.some((h) => h.kind !== 'unchanged')).toBe(true);
  });
});

describe('prepareBodyForDiff', () => {
  it('inserts newlines between HTML tags', () => {
    const out = prepareBodyForDiff('<div><span>x</span></div>', 'text/html');
    expect(out.split('\n').length).toBeGreaterThan(1);
  });
});

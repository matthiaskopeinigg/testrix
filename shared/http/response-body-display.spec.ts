import { describe, expect, it } from 'vitest';

import type { HttpResponseSnapshot } from './outgoing-request.schema';
import {
  detectResponseEditorLanguage,
  formatPrettyResponseBody,
  previewKind,
} from './response-body-display';

function snapshot(partial: Partial<HttpResponseSnapshot['body']> & { headers?: HttpResponseSnapshot['headers'] }): HttpResponseSnapshot {
  return {
    id: '1',
    capturedAt: '',
    requestSummary: { method: 'GET', url: '/' },
    status: { code: 200, text: 'OK', ok: true },
    timing: { totalMs: 0 },
    size: { headersBytes: 0, bodyBytes: 0 },
    headers: partial.headers ?? [],
    redirects: [],
    body: {
      encoding: 'text',
      text: '',
      ...partial,
    },
  };
}

describe('formatPrettyResponseBody', () => {
  it('indents valid JSON', () => {
    const snap = snapshot({ text: '{"x":1}', contentType: 'application/json' });
    expect(formatPrettyResponseBody(snap)).toBe('{\n  "x": 1\n}');
  });

  it('leaves HTML unmodified', () => {
    const snap = snapshot({ text: '<html></html>', contentType: 'text/html' });
    expect(formatPrettyResponseBody(snap)).toBe('<html></html>');
  });
});

describe('detectResponseEditorLanguage', () => {
  it('detects JSON from content-type', () => {
    const snap = snapshot({ text: '{}', contentType: 'application/json' });
    expect(detectResponseEditorLanguage(snap)).toBe('json');
  });

  it('detects HTML from content-type even when body starts with <', () => {
    const snap = snapshot({ text: '<html></html>', contentType: 'text/html' });
    expect(detectResponseEditorLanguage(snap)).toBe('html');
  });
});

describe('previewKind', () => {
  it('returns html for HTML bodies', () => {
    const snap = snapshot({ text: '<html></html>', contentType: 'text/html' });
    expect(previewKind(snap)).toBe('html');
  });
});

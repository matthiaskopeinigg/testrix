import { describe, expect, it } from 'vitest';

import type { HttpResponseSnapshot } from './outgoing-request.schema';
import {
  detectResponseEditorLanguage,
  formatPrettyResponseBody,
  prepareHtmlPreviewDocument,
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

describe('prepareHtmlPreviewDocument', () => {
  it('injects base href into head for relative assets', () => {
    const html = '<html><head><title>x</title></head><body></body></html>';
    const out = prepareHtmlPreviewDocument(html, 'https://magenta.at/home');
    expect(out).toContain('<base href="https://magenta.at/">');
  });

  it('adds head with base when document has no head', () => {
    const html = '<html><body>Hi</body></html>';
    const out = prepareHtmlPreviewDocument(html, 'magenta.at');
    expect(out).toContain('<head><base href="https://magenta.at/"></head>');
  });

  it('does not duplicate an existing base tag', () => {
    const html = '<html><head><base href="https://other.test/"></head></html>';
    expect(prepareHtmlPreviewDocument(html, 'https://magenta.at/')).toBe(html);
  });
});

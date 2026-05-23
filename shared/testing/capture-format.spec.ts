import { describe, expect, it } from 'vitest';

import {
  captureBodyPreviewContent,
  captureBodyToCodeEditorLanguage,
  captureResponseBodyEditorLanguage,
} from './capture-format';
import type { CaptureLogEntry } from './capture-log-entry.schema';

describe('captureBodyToCodeEditorLanguage', () => {
  it('maps plain to plaintext', () => {
    expect(captureBodyToCodeEditorLanguage('plain')).toBe('plaintext');
  });
});

describe('captureBodyPreviewContent', () => {
  it('pretty-prints JSON using Content-Type', () => {
    const out = captureBodyPreviewContent(
      [{ key: 'Content-Type', value: 'application/json' }],
      '{"a":1}',
      false,
    );
    expect(out).toContain('"a"');
    expect(out).toContain('\n');
  });
});

describe('captureResponseBodyEditorLanguage', () => {
  it('infers html from content-type', () => {
    const entry = {
      id: '1',
      captureItemId: 's',
      method: 'GET',
      url: 'https://example.com',
      at: '',
      requestHeaders: [],
      responseHeaders: [{ key: 'Content-Type', value: 'text/html' }],
      requestBody: '',
      responseBody: '<html></html>',
      requestBodyTruncated: false,
      requestBodyIsBinary: false,
      responseBodyTruncated: false,
      responseBodyIsBinary: false,
    } satisfies CaptureLogEntry;
    expect(captureResponseBodyEditorLanguage(entry)).toBe('html');
  });
});

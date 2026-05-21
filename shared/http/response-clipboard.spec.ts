import { describe, expect, it } from 'vitest';

import type { HttpResponseSnapshot } from './outgoing-request.schema';
import { buildRawHttpResponse, buildResponseCopyPayload } from './response-clipboard';

const sampleSnapshot = (): HttpResponseSnapshot => ({
  id: 'run-1',
  capturedAt: new Date().toISOString(),
  requestSummary: { method: 'GET', url: 'https://example.com' },
  status: { code: 200, text: 'OK', ok: true },
  timing: { totalMs: 42 },
  size: { headersBytes: 10, bodyBytes: 5 },
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  redirects: [],
  body: { encoding: 'text', text: '{"a":1}', contentType: 'application/json' },
});

describe('buildResponseCopyPayload', () => {
  it('copies pretty JSON body', () => {
    const payload = buildResponseCopyPayload('bodyJson', sampleSnapshot(), 'https://example.com', 'GET');
    expect(payload).toContain('"a"');
    expect(payload).toContain('1');
  });

  it('builds raw HTTP', () => {
    const raw = buildRawHttpResponse(sampleSnapshot());
    expect(raw).toContain('HTTP/1.1 200 OK');
    expect(raw).toContain('Content-Type: application/json');
  });
});

import { describe, expect, it } from 'vitest';

import { collectionFolderAuthSchema } from '@testrix/contracts';

import { websocketHandshakeHeaders } from './websocket';

describe('websocketHandshakeHeaders', () => {
  it('applies bearer auth and extra headers', () => {
    const result = websocketHandshakeHeaders({
      connectionId: 'tab-1',
      url: 'wss://example.com/ws',
      headers: [{ key: 'X-Trace', value: '1' }],
      protocols: [],
      verifyTls: true,
      timeoutMs: 30000,
      auth: collectionFolderAuthSchema.parse({ type: 'bearer', token: 'secret' }),
    });
    expect(result.url).toBe('wss://example.com/ws');
    expect(result.headers.Authorization).toBe('Bearer secret');
    expect(result.headers['X-Trace']).toBe('1');
  });
});

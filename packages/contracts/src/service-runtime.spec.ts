import { describe, expect, it } from 'vitest';

import { flowDetailHasExchange } from './service-runtime';

describe('flowDetailHasExchange', () => {
  it('keeps the exchange on the HTTP request, not on Capture', () => {
    expect(
      flowDetailHasExchange({
        kind: 'request',
        method: 'GET',
        url: 'https://127.0.1:4010/pin',
        status: 200,
        body: '{"pin":"646462"}',
      }),
    ).toBe(true);
    expect(
      flowDetailHasExchange({
        kind: 'capture',
        status: 200,
        url: 'https://127.0.1:4010/pin',
        body: '{"pin":"646462"}',
        captures: { otp: '646462' },
      }),
    ).toBe(false);
  });

  it('shows Listen and Intercept only after a hit', () => {
    expect(flowDetailHasExchange({ kind: 'listener', hit: false, url: 'https://example.test' })).toBe(false);
    expect(flowDetailHasExchange({ kind: 'listener', hit: true, status: 200 })).toBe(true);
    expect(flowDetailHasExchange({ kind: 'interceptor', hit: true, url: 'https://example.test' })).toBe(true);
  });
});

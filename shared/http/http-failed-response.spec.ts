import { describe, expect, it } from 'vitest';

import {
  createFailedHttpResponseSnapshot,
  resolveHttpErrorMessage,
} from './http-failed-response';

describe('resolveHttpErrorMessage', () => {
  it('reads userMessage from IPC payloads', () => {
    expect(
      resolveHttpErrorMessage({
        code: 'HTTP_REQUEST_FAILED',
        userMessage: 'getaddrinfo ENOTFOUND googler',
        name: 'TestrixError',
      }),
    ).toBe('getaddrinfo ENOTFOUND googler');
  });
});

describe('createFailedHttpResponseSnapshot', () => {
  it('uses status code 0 and puts the error in the body', () => {
    const snap = createFailedHttpResponseSnapshot(
      {
        requestId: 'req-1',
        method: 'GET',
        url: 'https://googler',
        environmentId: null,
      },
      'getaddrinfo ENOTFOUND googler',
    );
    expect(snap.status.code).toBe(0);
    expect(snap.body.text).toBe('getaddrinfo ENOTFOUND googler');
    expect(snap.meta?.errorMessage).toBe('getaddrinfo ENOTFOUND googler');
  });
});

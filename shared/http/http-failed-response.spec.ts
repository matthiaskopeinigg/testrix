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

  it('rewrites Invalid URL from IPC rejections', () => {
    const err = new Error('Invalid URL') as Error & {
      code: string;
      userMessage: string;
    };
    err.code = 'HTTP_REQUEST_FAILED';
    err.userMessage = 'Invalid URL';
    expect(resolveHttpErrorMessage(err)).toBe(
      'The request URL is invalid or empty. Enter a full URL (for example, https://api.example.com).',
    );
  });

  it('unwraps legacy Electron invoke errors', () => {
    expect(
      resolveHttpErrorMessage(new Error("Error invoking remote method 'http:send': Invalid URL")),
    ).toBe(
      'The request URL is invalid or empty. Enter a full URL (for example, https://api.example.com).',
    );
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

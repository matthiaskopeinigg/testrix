import { describe, expect, it } from 'vitest';

import { unwrapIpcInvokeError } from './ipc-error-payload';

describe('unwrapIpcInvokeError', () => {
  it('reads plain IPC payloads', () => {
    expect(
      unwrapIpcInvokeError({
        code: 'HTTP_REQUEST_FAILED',
        userMessage: 'Invalid URL',
      }),
    ).toEqual({
      code: 'HTTP_REQUEST_FAILED',
      userMessage: 'Invalid URL',
    });
  });

  it('reads code and userMessage attached to an Error', () => {
    const err = new Error('Invalid URL') as Error & {
      code: string;
      userMessage: string;
    };
    err.code = 'HTTP_REQUEST_FAILED';
    err.userMessage = 'Invalid URL';
    expect(unwrapIpcInvokeError(err)).toEqual({
      code: 'HTTP_REQUEST_FAILED',
      userMessage: 'Invalid URL',
    });
  });

  it('parses TestrixError-style messages', () => {
    expect(
      unwrapIpcInvokeError(new Error('HTTP_REQUEST_FAILED: Connection refused')),
    ).toEqual({
      code: 'HTTP_REQUEST_FAILED',
      userMessage: 'Connection refused',
    });
  });

  it('parses Electron invoke wrapper messages', () => {
    expect(
      unwrapIpcInvokeError(new Error("Error invoking remote method 'http:send': Invalid URL")),
    ).toEqual({
      code: 'IPC_HANDLER_FAILED',
      userMessage: 'Invalid URL',
    });
  });

  it('returns null for [object Object] invoke wrappers', () => {
    expect(
      unwrapIpcInvokeError(new Error("Error invoking remote method 'http:send': [object Object]")),
    ).toBeNull();
  });
});

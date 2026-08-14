import { describe, expect, it } from 'vitest';

import { buildHttpResponseStepCapture } from './flow-step-capture';
import {
  normalizeCacheEntryForReferenceStepType,
  resolveCacheEntryValue,
} from './flow-step-cache';

describe('flow-step-cache', () => {
  it('normalizes request_body to response_body for HTTP cache entries', () => {
    expect(
      normalizeCacheEntryForReferenceStepType('REQUEST', {
        variableName: 'userId',
        source: 'request_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toEqual({
      variableName: 'userId',
      source: 'response_body',
      expression: '',
      extractKind: 'jsonpath',
      extract: '$[0].id',
    });
  });

  it('extracts jsonpath values from a referenced HTTP response capture', () => {
    const capture = buildHttpResponseStepCapture({
      status: { code: 200, text: 'OK' },
      body: {
        text: JSON.stringify([{ id: 1, username: 'Bret' }, { id: 2, username: 'Antonette' }]),
      },
      headers: [],
    });

    expect(
      resolveCacheEntryValue(capture, {
        variableName: 'userId',
        source: 'response_body',
        expression: '',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toBe('1');
  });
});

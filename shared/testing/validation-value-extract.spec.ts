import { describe, expect, it } from 'vitest';

import { extractFlowCachedValue, inferFlowValueExtractKind } from './validation-value-extract';

const usersJson = JSON.stringify([
  { id: 1, username: 'Bret', name: 'Leanne Graham' },
  { id: 2, username: 'Antonette', name: 'Ervin Howell' },
]);

describe('validation-value-extract', () => {
  it('infers jsonpath for dotted and bracket paths', () => {
    expect(
      inferFlowValueExtractKind({
        source: 'response_body',
        extract: '$[0].id',
      }),
    ).toBe('jsonpath');
    expect(
      inferFlowValueExtractKind({
        source: 'response_body',
        extract: '/0/id',
      }),
    ).toBe('json_pointer');
  });

  it('extracts jsonpath values from response bodies', () => {
    expect(
      extractFlowCachedValue(usersJson, {
        source: 'response_body',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toBe('1');
    expect(
      extractFlowCachedValue(usersJson, {
        source: 'response_body',
        extractKind: 'jsonpath',
        extract: '$[0].username',
      }),
    ).toBe('Bret');
  });

  it('extracts json pointer values from response bodies', () => {
    expect(
      extractFlowCachedValue(usersJson, {
        source: 'response_body',
        extractKind: 'json_pointer',
        extract: '/0/name',
      }),
    ).toBe('Leanne Graham');
  });

  it('returns full raw value when extract kind is full', () => {
    expect(
      extractFlowCachedValue('200', {
        source: 'response_status',
        extractKind: 'full',
        extract: '',
      }),
    ).toBe('200');
  });

  it('extracts via regex capture group', () => {
    expect(
      extractFlowCachedValue('token=abc123&scope=read', {
        source: 'response_body',
        extractKind: 'text_regex',
        extract: 'token=([^&]+)',
      }),
    ).toBe('abc123');
  });

  it('returns null for invalid json paths', () => {
    expect(
      extractFlowCachedValue('not-json', {
        source: 'response_body',
        extractKind: 'jsonpath',
        extract: '$[0].id',
      }),
    ).toBeNull();
  });
});

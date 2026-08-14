import { describe, expect, it } from 'vitest';

import { createHttpKeyValueRow } from './http-settings.schema';
import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
  resolveRequestContentTypeHint,
  requestHeaderRowsDefineKey,
  suggestRequestContentType,
} from './collection-request-settings.schema';

describe('collectionRequestSettingsSchema', () => {
  it('provides defaults', () => {
    const settings = createDefaultCollectionRequestSettings();
    expect(settings.environmentId).toBeNull();
    expect(settings.body).toEqual({ mode: 'none' });
    expect(settings.auth.type).toBe('inherit');
    expect(settings.headers.rows).toEqual([]);
  });

  it('enriches partial persisted settings', () => {
    const enriched = enrichCollectionRequestSettings({
      environmentId: 'env-1',
      body: { mode: 'json', raw: '{"a":1}' },
    });
    expect(enriched.environmentId).toBe('env-1');
    expect(enriched.body).toEqual({ mode: 'json', raw: '{"a":1}' });
    expect(enriched.queryParams).toEqual([]);
  });

  it('suggests Content-Type from body mode', () => {
    expect(suggestRequestContentType({ mode: 'none' })).toBeNull();
    expect(suggestRequestContentType({ mode: 'json', raw: '{}' })).toBe('application/json');
    expect(
      suggestRequestContentType({
        mode: 'binary',
        source: 'inline',
        contentBase64: 'aGk=',
        contentType: 'image/png',
      }),
    ).toBe('image/png');
  });

  it('infers Content-Type for text bodies from payload shape', () => {
    expect(suggestRequestContentType({ mode: 'text', raw: '' })).toBeNull();
    expect(suggestRequestContentType({ mode: 'text', raw: '{"a":1}' })).toBe('application/json');
    expect(suggestRequestContentType({ mode: 'text', raw: '<root/>' })).toBe('application/xml');
    expect(suggestRequestContentType({ mode: 'text', raw: 'hello' })).toBe('text/plain');
  });

  it('detects when request rows define a header key', () => {
    const headers = {
      rows: [createHttpKeyValueRow({ key: 'Content-Type', value: 'application/json', enabled: true })],
      overrides: {},
    };
    expect(requestHeaderRowsDefineKey(headers, 'content-type')).toBe(true);
    expect(requestHeaderRowsDefineKey(headers, 'Accept')).toBe(false);
  });

  it('omits Content-Type hint when the request already defines Content-Type', () => {
    const headers = {
      rows: [createHttpKeyValueRow({ key: 'Content-Type', value: 'text/plain', enabled: true })],
      overrides: {},
    };
    expect(resolveRequestContentTypeHint({ mode: 'json', raw: '{}' }, headers)).toBeNull();
    expect(resolveRequestContentTypeHint({ mode: 'json', raw: '{}' }, { rows: [], overrides: {} })).toBe(
      'application/json',
    );
  });
});

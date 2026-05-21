import { describe, expect, it } from 'vitest';

import {
  createDefaultCollectionRequestSettings,
  enrichCollectionRequestSettings,
  suggestRequestContentType,
} from './collection-request-settings.schema';

describe('collectionRequestSettingsSchema', () => {
  it('provides defaults', () => {
    const settings = createDefaultCollectionRequestSettings();
    expect(settings.environmentId).toBeNull();
    expect(settings.body).toEqual({ mode: 'none' });
    expect(settings.auth.type).toBe('none');
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
});

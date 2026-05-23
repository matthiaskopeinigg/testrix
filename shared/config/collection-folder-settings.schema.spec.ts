import { describe, expect, it } from 'vitest';

import {
  COLLECTION_DESCRIBED_KV_MAX_ROWS,
  collectionFolderSettingsSchema,
  createCollectionDescribedKeyValueRow,
  createDefaultCollectionFolderSettings,
  enrichCollectionFolderSettings,
} from './collection-folder-settings.schema';

describe('collectionFolderSettingsSchema', () => {
  it('accepts default settings', () => {
    const settings = createDefaultCollectionFolderSettings();
    expect(settings.environmentId).toBeNull();
    expect(collectionFolderSettingsSchema.parse(settings)).toEqual(settings);
  });

  it('accepts bearer auth', () => {
    const settings = createDefaultCollectionFolderSettings();
    settings.auth = { type: 'bearer', token: '{{token}}' };
    expect(collectionFolderSettingsSchema.parse(settings).auth.type).toBe('bearer');
  });

  it('accepts oauth2 auth', () => {
    const settings = createDefaultCollectionFolderSettings();
    settings.auth = {
      type: 'oauth2',
      grantType: 'client_credentials',
      authUrl: 'https://auth.example.com',
      tokenUrl: 'https://token.example.com',
      clientId: 'id',
      clientSecret: 'secret',
      scope: 'read',
      redirectUri: 'https://app/callback',
    };
    expect(collectionFolderSettingsSchema.parse(settings).auth.type).toBe('oauth2');
  });

  it('rejects rows over max', () => {
    const settings = createDefaultCollectionFolderSettings();
    settings.variables = Array.from({ length: COLLECTION_DESCRIBED_KV_MAX_ROWS + 1 }, () =>
      createCollectionDescribedKeyValueRow(),
    );
    expect(() => collectionFolderSettingsSchema.parse(settings)).toThrow();
  });
});

describe('enrichCollectionFolderSettings', () => {
  it('returns defaults for null input', () => {
    expect(enrichCollectionFolderSettings(null)).toEqual(createDefaultCollectionFolderSettings());
  });

  it('merges partial scripts', () => {
    const enriched = enrichCollectionFolderSettings({ scripts: { pre: '// pre' } });
    expect(enriched.scripts.pre).toBe('// pre');
    expect(enriched.scripts.post).toBe('');
  });

  it('merges tags, docs, and transport', () => {
    const enriched = enrichCollectionFolderSettings({
      environmentId: 'env-prod',
      tags: ['api'],
      docs: '## Notes',
      transport: { timeoutMs: 5000 },
    });
    expect(enriched.environmentId).toBe('env-prod');
    expect(enriched.tags).toEqual(['api']);
    expect(enriched.docs).toBe('## Notes');
    expect(enriched.transport.timeoutMs).toBe(5000);
  });
});

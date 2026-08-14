import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from './collection-folder-settings.schema';
import {
  applyCollectionRequestAuth,
  resolveCollectionRequestAuth,
} from './resolve-collection-request-auth';

describe('resolveCollectionRequestAuth', () => {
  it('uses request auth when not inherit', () => {
    const resolved = resolveCollectionRequestAuth(
      { type: 'bearer', token: 'tok' },
      [
        {
          id: 'f1',
          label: 'API',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: { type: 'basic', username: 'a', password: 'b' },
          },
        },
      ],
    );
    expect(resolved.source).toBe('request');
    expect(resolved.auth.type).toBe('bearer');
  });

  it('inherits from nearest folder with concrete auth', () => {
    const resolved = resolveCollectionRequestAuth(
      { type: 'inherit' },
      [
        {
          id: 'f1',
          label: 'Root',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: { type: 'none' },
          },
        },
        {
          id: 'f2',
          label: 'Child',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: { type: 'apiKey', name: 'X-Key', value: 'secret', in: 'header' },
          },
        },
      ],
    );
    expect(resolved.source).toBe('folder');
    expect(resolved.folderId).toBe('f2');
  });

  it('passes through intermediate folder none to parent folder auth', () => {
    const resolved = resolveCollectionRequestAuth(
      { type: 'inherit' },
      [
        {
          id: 'oneweb',
          label: 'OneWeb',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: {
              type: 'apiKey',
              name: 'Authorization',
              value: 'secret-key',
              in: 'header',
            },
          },
        },
        {
          id: 'b2c',
          label: 'b2c',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            auth: { type: 'none' },
          },
        },
      ],
    );
    expect(resolved.source).toBe('folder');
    expect(resolved.folderId).toBe('oneweb');
    expect(resolved.auth).toEqual({
      type: 'apiKey',
      name: 'Authorization',
      value: 'secret-key',
      in: 'header',
    });
  });
});

describe('applyCollectionRequestAuth', () => {
  it('sets Authorization header for bearer', () => {
    const headers: Record<string, string> = {};
    applyCollectionRequestAuth({ type: 'bearer', token: 'abc' }, headers, 'https://x.com');
    expect(headers['Authorization']).toBe('Bearer abc');
  });
});

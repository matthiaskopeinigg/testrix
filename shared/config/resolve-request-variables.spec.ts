import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from './collection-folder-settings.schema';
import { resolveRequestVariables } from './resolve-request-variables';

describe('resolveRequestVariables', () => {
  it('resolves folder variables that reference environment placeholders', () => {
    const map = resolveRequestVariables(
      [
        {
          id: 'f1',
          label: 'API',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            variables: [{ id: 'v1', key: 'base', value: '{{host}}/v1' }],
          },
        },
      ],
      {
        id: 'env',
        name: 'Local',
        nodes: [
          { id: 'n1', kind: 'variable', key: 'host', value: 'https://api.test' },
        ],
      },
    );

    expect(map['host']).toBe('https://api.test');
    expect(map['base']).toBe('https://api.test/v1');
  });

  it('lets deeper folder variables override parent keys', () => {
    const map = resolveRequestVariables(
      [
        {
          id: 'root',
          label: 'Root',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            variables: [{ id: 'v1', key: 'token', value: 'root-token' }],
          },
        },
        {
          id: 'child',
          label: 'Child',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            variables: [{ id: 'v2', key: 'token', value: 'child-token' }],
          },
        },
      ],
      null,
    );

    expect(map['token']).toBe('child-token');
  });

  it('lets shared script variables override environment and folder values', () => {
    const map = resolveRequestVariables(
      [
        {
          id: 'f1',
          label: 'API',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            variables: [{ id: 'v1', key: 'token', value: 'folder-token' }],
          },
        },
      ],
      {
        id: 'env',
        name: 'Local',
        nodes: [
          { id: 'n1', kind: 'variable', key: 'token', value: 'env-token' },
        ],
      },
      { token: 'script-token' },
    );

    expect(map['token']).toBe('script-token');
  });
});

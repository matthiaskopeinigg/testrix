import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from './collection-folder-settings.schema';
import { resolveCollectionRequestEnvironmentId } from './resolve-collection-request-environment';

describe('resolveCollectionRequestEnvironmentId', () => {
  it('prefers request environment when set', () => {
    const id = resolveCollectionRequestEnvironmentId('req-env', [
      {
        settings: {
          ...createDefaultCollectionFolderSettings(),
          environmentId: 'folder-env',
        },
      },
    ]);
    expect(id).toBe('req-env');
  });

  it('inherits from nearest ancestor folder when request has none', () => {
    const id = resolveCollectionRequestEnvironmentId(null, [
      {
        settings: {
          ...createDefaultCollectionFolderSettings(),
          environmentId: 'root-env',
        },
      },
      {
        settings: {
          ...createDefaultCollectionFolderSettings(),
          environmentId: 'child-env',
        },
      },
    ]);
    expect(id).toBe('child-env');
  });

  it('returns null when nothing is configured', () => {
    expect(
      resolveCollectionRequestEnvironmentId(null, [
        { settings: createDefaultCollectionFolderSettings() },
      ]),
    ).toBeNull();
  });

  it('skips folder inheritance when request forces no environment', () => {
    const id = resolveCollectionRequestEnvironmentId('', [
      {
        settings: {
          ...createDefaultCollectionFolderSettings(),
          environmentId: 'folder-env',
        },
      },
    ]);
    expect(id).toBeNull();
  });
});

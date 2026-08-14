import { describe, expect, it } from 'vitest';

import { migrateCaptureFile } from './capture-migrate';

describe('migrateCaptureFile', () => {
  it('migrates v1 flat items to v2 tree at root', () => {
    const migrated = migrateCaptureFile({
      schemaVersion: 1,
      active: true,
      items: [{ id: 'a', name: 'Session A', startUrl: 'https://a.test', updatedAt: '2020-01-01' }],
    });
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.active).toBe(true);
    expect(migrated.items).toHaveLength(1);
    expect(migrated.items[0]).toMatchObject({ id: 'a', name: 'Session A' });
  });

  it('migrates v2 files to v3 with empty traffic', () => {
    const file = {
      schemaVersion: 2 as const,
      active: false,
      items: [
        {
          id: 'f1',
          name: 'Folder',
          updatedAt: '2020-01-01',
          children: [{ id: 's1', name: 'S', startUrl: 'about:blank', updatedAt: '2020-01-01' }],
        },
      ],
    };
    const migrated = migrateCaptureFile(file);
    expect(migrated.schemaVersion).toBe(3);
    const session = migrated.items[0];
    expect(session && 'children' in session && session.children[0]).toMatchObject({
      id: 's1',
      traffic: [],
    });
  });
});

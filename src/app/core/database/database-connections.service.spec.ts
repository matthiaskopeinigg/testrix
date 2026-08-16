import { describe, expect, it } from 'vitest';

import { createDefaultDatabaseConnection } from '@shared/config';

import { mergeDatabaseConnectionDrafts } from './database-connections.service';

describe('mergeDatabaseConnectionDrafts', () => {
  it('appends a root draft without mutating saved nodes', () => {
    const saved = [createDefaultDatabaseConnection('mysql', 'saved')];
    const draft = createDefaultDatabaseConnection('postgresql', 'draft');
    const merged = mergeDatabaseConnectionDrafts(saved, [{ connection: draft, parentId: null }]);
    expect(saved).toHaveLength(1);
    expect(merged.map((item) => item.id)).toEqual(['saved', 'draft']);
  });

  it('nests a draft under a folder', () => {
    const folder = {
      id: 'folder',
      kind: 'folder' as const,
      name: 'Prod',
      updatedAt: '2020-01-01T00:00:00.000Z',
      children: [] as const,
    };
    const draft = createDefaultDatabaseConnection('oracle', 'draft');
    const merged = mergeDatabaseConnectionDrafts([folder], [{ connection: draft, parentId: 'folder' }]);
    expect(merged[0]).toMatchObject({ id: 'folder', kind: 'folder' });
    expect(merged[0] && 'children' in merged[0] ? merged[0].children.map((c) => c.id) : []).toEqual(['draft']);
  });
});

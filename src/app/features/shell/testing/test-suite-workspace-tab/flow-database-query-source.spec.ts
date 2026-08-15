import { describe, expect, it } from 'vitest';

import type { SavedQueryTreeItem } from '@shared/database';

import { savedQueryDropdownOptions } from './flow-database-query-source';

const nodes: readonly SavedQueryTreeItem[] = [
  {
    id: 'folder-1',
    kind: 'folder',
    name: 'Reports',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children: [
      {
        id: 'q-users',
        kind: 'query',
        name: 'List users',
        connectionId: 'conn-pg',
        query: 'SELECT 1',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'q-root',
    kind: 'query',
    name: 'Ping',
    connectionId: '',
    query: 'PING',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('savedQueryDropdownOptions', () => {
  it('prefixes folder names and includes root queries', () => {
    expect(savedQueryDropdownOptions(nodes)).toEqual([
      { value: 'q-users', label: 'Reports / List users' },
      { value: 'q-root', label: 'Ping' },
    ]);
  });
});

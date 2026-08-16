import { describe, expect, it } from 'vitest';

import type { DatabaseConnection } from '@shared/config';

import { emptyConnectionCatalogState } from '@app/core/database/database-catalog.types';

import { attachCatalogToConnectionTree, ConnectionCatalogAttachCache } from './connection-catalog.attach';
import { databaseSchemasSelectedLabel } from './connection-catalog.tree';
import type { ConnectionTreeNode } from './connection-tree.types';

function pgConnection(id: string, label: string): ConnectionTreeNode {
  return {
    id,
    label,
    kind: 'connection',
    icon: 'database',
    subtitle: 'localhost:5432',
    data: { kind: 'connection', type: 'postgresql', host: 'localhost', port: 5432 },
  };
}

function pgProfile(id: string): DatabaseConnection {
  return {
    id,
    kind: 'connection',
    name: id,
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    connectOnBoot: false,
    selectedSchemas: ['public'],
  };
}

function readyCatalog(tableNames: readonly string[]) {
  return {
    ...emptyConnectionCatalogState(),
    state: 'ready' as const,
    schemas: [{ name: 'public', system: false }],
    tablesBySchema: {
      public: tableNames.map((name) => ({ schema: 'public', name, kind: 'table' as const })),
    },
  };
}

describe('attachCatalogToConnectionTree', () => {
  it('returns the same tree reference when nothing visible changed', () => {
    const cache = new ConnectionCatalogAttachCache();
    const nodes = [pgConnection('a', 'Alpha')];
    const catalogs = { a: readyCatalog(['users']) };
    const first = cache.attach(nodes, (id) => catalogs[id as 'a'], {}, false, pgProfile);
    const second = cache.attach(nodes, (id) => catalogs[id as 'a'], {}, false, pgProfile);
    expect(second).toBe(first);
  });

  it('reuses catalog children when only the status dot changes', () => {
    const cache = new ConnectionCatalogAttachCache();
    const nodes = [pgConnection('a', 'Alpha')];
    const catalogs = { a: readyCatalog(['users']) };
    const first = cache.attach(nodes, (id) => catalogs[id as 'a'], {}, false, pgProfile);
    const second = cache.attach(
      nodes,
      (id) => catalogs[id as 'a'],
      { a: { state: 'connected' } },
      false,
      pgProfile,
    );
    expect(second).not.toBe(first);
    expect(second[0]?.children).toBe(first[0]?.children);
    expect(second[0]?.statusDot).toBe('connected');
  });

  it('does not rebuild connection A when connection B catalog changes', () => {
    const cache = new ConnectionCatalogAttachCache();
    const nodes = [pgConnection('a', 'Alpha'), pgConnection('b', 'Beta')];
    const catalogs: Record<string, ReturnType<typeof readyCatalog>> = {
      a: readyCatalog(['users']),
      b: readyCatalog(['orders']),
    };
    const first = cache.attach(nodes, (id) => catalogs[id], {}, false, pgProfile);
    catalogs['b'] = readyCatalog(['orders', 'items']);
    const second = cache.attach(nodes, (id) => catalogs[id], {}, false, pgProfile);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    const schema = second[1]?.children?.find((child) => child.kind === 'schema');
    expect(schema?.children?.[0]?.children?.map((child) => child.label)).toEqual(['orders', 'items']);
  });

  it('still attaches catalog children without a cache', () => {
    const nodes = [pgConnection('a', 'Alpha')];
    const catalog = readyCatalog(['users']);
    const tree = attachCatalogToConnectionTree(nodes, () => catalog, {}, false, undefined, pgProfile);
    expect(tree[0]?.children?.map((child) => child.label)).toEqual([
      databaseSchemasSelectedLabel(1),
      'public',
    ]);
  });
});

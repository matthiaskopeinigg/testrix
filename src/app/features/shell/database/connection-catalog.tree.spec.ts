import { describe, expect, it } from 'vitest';

import { emptyConnectionCatalogState } from '@app/core/database/database-catalog.types';

import { buildConnectionCatalogChildren } from './connection-catalog.tree';

describe('buildConnectionCatalogChildren', () => {
  it('omits empty Views and does not leave a loading child id', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [{ name: 'public', system: false }],
      tablesBySchema: {
        public: [{ schema: 'public', name: 'users', kind: 'table' as const }],
      },
    };
    const nodes = buildConnectionCatalogChildren('c1', 'postgresql', catalog, false);
    const schema = nodes[0];
    expect(schema?.children?.map((child) => child.label)).toEqual(['Tables']);
    expect(schema?.children?.some((child) => child.label.includes('Loading'))).toBe(false);
    const table = schema?.children?.[0]?.children?.[0];
    expect(table?.subtitle).toBe('Loading…');
    expect(table?.children ?? []).toEqual([]);
  });

  it('shows a loading placeholder until schema tables arrive', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [{ name: 'public', system: false }],
      tablesBySchema: {},
    };
    const nodes = buildConnectionCatalogChildren('c1', 'postgresql', catalog, false);
    const schema = nodes[0];
    expect(schema?.subtitle).toBeUndefined();
    expect(schema?.children?.map((child) => child.label)).toEqual(['Loading tables…']);
  });

  it('returns no children while the catalog is loading', () => {
    const nodes = buildConnectionCatalogChildren(
      'c1',
      'postgresql',
      { ...emptyConnectionCatalogState(), state: 'loading' },
      false,
    );
    expect(nodes).toEqual([]);
  });
});

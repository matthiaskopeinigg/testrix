import { describe, expect, it } from 'vitest';

import { emptyConnectionCatalogState } from '@app/core/database/database-catalog.types';

import { buildConnectionCatalogChildren, createConnectionCatalogBuildMemo } from './connection-catalog.tree';

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
    expect(table?.subtitle).toBeUndefined();
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

  it('shows only selected schemas when the connection lists them', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [
        { name: 'HR', system: false },
        { name: 'SCOTT', system: false },
        { name: 'APP', system: false },
      ],
      tablesBySchema: {},
    };
    const nodes = buildConnectionCatalogChildren('c1', 'oracle', catalog, {
      showSystemObjects: false,
      connection: { type: 'oracle', user: 'hr', selectedSchemas: ['APP', 'SCOTT'] },
    });
    expect(nodes.map((node) => node.label)).toEqual(['SCOTT', 'APP']);
  });

  it('defaults Oracle to the connection user when selection is unset', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [
        { name: 'HR', system: false },
        { name: 'SCOTT', system: false },
      ],
      tablesBySchema: {},
    };
    const nodes = buildConnectionCatalogChildren('c1', 'oracle', catalog, {
      showSystemObjects: false,
      connection: { type: 'oracle', user: 'hr' },
    });
    expect(nodes.map((node) => node.label)).toEqual(['HR']);
  });

  it('reuses unchanged table nodes when another table detail is patched', () => {
    const tables = [
      { schema: 'public', name: 'users', kind: 'table' as const },
      { schema: 'public', name: 'orders', kind: 'table' as const },
    ];
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [{ name: 'public', system: false }],
      tablesBySchema: { public: tables },
    };
    const memo = createConnectionCatalogBuildMemo();
    const first = buildConnectionCatalogChildren('c1', 'postgresql', catalog, false, memo);
    const users = first[0]?.children?.[0]?.children?.[0];
    const patched = {
      ...catalog,
      detailsByTable: {
        'public.orders': {
          state: 'ready' as const,
          columns: [{ name: 'id', type: 'int', nullable: false, primaryKey: true }],
          indexes: [],
          foreignKeys: [],
        },
      },
    };
    const second = buildConnectionCatalogChildren('c1', 'postgresql', patched, false, memo);
    expect(second[0]?.children?.[0]?.children?.[0]).toBe(users);
    expect(second[0]?.children?.[0]?.children?.[1]?.children?.some((child) => child.label === 'Columns')).toBe(
      true,
    );
  });
});

import { describe, expect, it } from 'vitest';

import { emptyConnectionCatalogState } from '@app/core/database/database-catalog.types';

import {
  buildConnectionCatalogChildren,
  createConnectionCatalogBuildMemo,
  databaseSchemasSelectedLabel,
} from './connection-catalog.tree';

const publicSelected = {
  showSystemObjects: false,
  connection: { type: 'postgresql' as const, selectedSchemas: ['public'] },
};

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
    const nodes = buildConnectionCatalogChildren('c1', 'postgresql', catalog, publicSelected);
    const schema = nodes.find((node) => node.kind === 'schema');
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
    const nodes = buildConnectionCatalogChildren('c1', 'postgresql', catalog, publicSelected);
    const schema = nodes.find((node) => node.kind === 'schema');
    expect(schema?.subtitle).toBeUndefined();
    expect(schema?.children?.map((child) => child.label)).toEqual(['Loading tables…']);
  });

  it('puts a schemas-selected action first while the catalog is loading', () => {
    const nodes = buildConnectionCatalogChildren(
      'c1',
      'postgresql',
      { ...emptyConnectionCatalogState(), state: 'loading' },
      false,
    );
    expect(nodes.map((node) => node.label)).toEqual([databaseSchemasSelectedLabel(0)]);
    expect(nodes[0]?.kind).toBe('schemas');
    expect(nodes[0]?.icon).toBe('sliders');
  });

  it('keeps selected schemas visible while the catalog is loading', () => {
    const nodes = buildConnectionCatalogChildren(
      'c1',
      'postgresql',
      { ...emptyConnectionCatalogState(), state: 'loading' },
      {
        showSystemObjects: false,
        connection: { type: 'postgresql', selectedSchemas: ['public', 'app'] },
      },
    );
    expect(nodes.map((node) => node.kind)).toEqual(['schemas', 'schema', 'schema']);
    expect(nodes.map((node) => node.label)).toEqual([
      databaseSchemasSelectedLabel(2),
      'public',
      'app',
    ]);
  });

  it('shows selected schemas even when the seed catalog list is empty', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemaDirectory: 'seed' as const,
      schemas: [],
    };
    const nodes = buildConnectionCatalogChildren('c1', 'oracle', catalog, {
      showSystemObjects: false,
      connection: { type: 'oracle', user: 'hr', selectedSchemas: ['APP'] },
    });
    expect(nodes.map((node) => node.label)).toEqual([databaseSchemasSelectedLabel(1), 'APP']);
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
    expect(nodes.map((node) => node.label)).toEqual([
      databaseSchemasSelectedLabel(2),
      'SCOTT',
      'APP',
    ]);
  });

  it('does not add public or the Oracle user as a default schema', () => {
    const catalog = {
      ...emptyConnectionCatalogState(),
      state: 'ready' as const,
      schemas: [
        { name: 'public', system: false },
        { name: 'HR', system: false },
        { name: 'SCOTT', system: false },
      ],
      tablesBySchema: {},
    };
    const postgres = buildConnectionCatalogChildren('c1', 'postgresql', catalog, {
      showSystemObjects: false,
      connection: { type: 'postgresql' },
    });
    expect(postgres.map((node) => node.label)).toEqual([databaseSchemasSelectedLabel(0)]);
    const oracle = buildConnectionCatalogChildren('c1', 'oracle', catalog, {
      showSystemObjects: false,
      connection: { type: 'oracle', user: 'hr' },
    });
    expect(oracle.map((node) => node.label)).toEqual([databaseSchemasSelectedLabel(0)]);
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
    const first = buildConnectionCatalogChildren('c1', 'postgresql', catalog, publicSelected, memo);
    const schema = first.find((node) => node.kind === 'schema');
    const users = schema?.children?.[0]?.children?.[0];
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
    const second = buildConnectionCatalogChildren('c1', 'postgresql', patched, publicSelected, memo);
    const nextSchema = second.find((node) => node.kind === 'schema');
    expect(nextSchema?.children?.[0]?.children?.[0]).toBe(users);
    expect(nextSchema?.children?.[0]?.children?.[1]?.children?.some((child) => child.label === 'Columns')).toBe(
      true,
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  catalogPrefetchTarget,
  detectSqlCompletionContext,
  mergeDatabaseQueryCompletions,
} from './sql-catalog-completions';

describe('mergeDatabaseQueryCompletions', () => {
  const catalog = {
    schemas: [
      { name: 'public', system: false },
      { name: 'app', system: false },
    ],
    tables: [
      { schema: 'public', name: 'users', kind: 'table' as const },
      { schema: 'app', name: 'orders', kind: 'table' as const },
    ],
    columnsByTable: {
      'public.users': [
        { name: 'id', type: 'integer', nullable: false, primaryKey: true },
        { name: 'email', type: 'text', nullable: true, primaryKey: false },
      ],
      'app.orders': [{ name: 'total', type: 'numeric', nullable: false, primaryKey: false }],
    },
  };

  it('prefers tables and schemas after FROM', () => {
    const items = mergeDatabaseQueryCompletions('postgresql', catalog, 'SELECT * FROM ', 16);
    expect(items[0]?.detail === 'Table' || items[0]?.detail === 'View' || items[0]?.detail === 'Schema').toBe(
      true,
    );
    expect(items.some((item) => item.label === 'public.users' || item.label === 'users')).toBe(true);
    expect(detectSqlCompletionContext('SELECT * FROM ', 16).kind).toBe('table-ref');
  });

  it('does not dump hundreds of schema names after a bare FROM', () => {
    const huge = {
      schemas: Array.from({ length: 500 }, (_, index) => ({
        name: `SCHEMA_${index}`,
        system: false,
      })),
      tables: [{ schema: 'SCHEMA_0', name: 't', kind: 'table' as const }],
      columnsByTable: {},
    };
    const items = mergeDatabaseQueryCompletions('oracle', huge, 'SELECT * FROM ', 16);
    const schemaItems = items.filter((item) => item.detail === 'Schema');
    expect(schemaItems.length).toBe(0);
    expect(items.some((item) => item.label.includes('SCHEMA_0.t') || item.insert.includes('t'))).toBe(
      true,
    );
    expect(items.length).toBeLessThan(80);
  });

  it('filters schemas by typed prefix after FROM', () => {
    const huge = {
      schemas: [
        { name: 'HR', system: false },
        { name: 'APP', system: false },
        ...Array.from({ length: 200 }, (_, index) => ({
          name: `OTHER_${index}`,
          system: false,
        })),
      ],
      tables: [],
      columnsByTable: {},
    };
    const items = mergeDatabaseQueryCompletions('oracle', huge, 'SELECT * FROM HR', 18);
    expect(items.some((item) => item.label === 'HR' && item.detail === 'Schema')).toBe(true);
    expect(items.filter((item) => item.detail === 'Schema').length).toBeLessThanOrEqual(48);
  });

  it('suggests tables after a schema qualifier', () => {
    const items = mergeDatabaseQueryCompletions('postgresql', catalog, 'SELECT * FROM app.', 18);
    expect(items[0]?.insert).toBe('app.orders');
    expect(items[0]?.detail).toBe('Table');
  });

  it('prefers columns of the FROM table and dotted table.column', () => {
    const fromCols = mergeDatabaseQueryCompletions(
      'postgresql',
      catalog,
      'SELECT * FROM users WHERE ',
      26,
    );
    expect(fromCols[0]?.label).toBe('id');
    const dotted = mergeDatabaseQueryCompletions('postgresql', catalog, 'SELECT users.', 13);
    expect(dotted[0]?.insert).toBe('users.id');
  });

  it('reports prefetch targets for schema and table qualifiers', () => {
    expect(catalogPrefetchTarget('SELECT * FROM app.', 18, catalog)).toEqual({ schema: 'app' });
    expect(catalogPrefetchTarget('SELECT users.', 13, catalog)).toEqual({
      schema: 'public',
      table: 'users',
    });
    // Bare FROM must not prefetch (Oracle all_tables can freeze the UI).
    expect(catalogPrefetchTarget('SELECT * FROM ', 16, catalog)).toBeNull();
    expect(catalogPrefetchTarget('SELECT * FROM ap', 18, catalog)).toEqual({ schema: 'app' });
  });
});

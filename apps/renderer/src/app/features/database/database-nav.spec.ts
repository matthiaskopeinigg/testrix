import { describe, expect, it } from 'vitest';

import { buildSchemaCatalogChildren, buildTableCatalogChildren } from './database-nav';

describe('buildTableCatalogChildren', () => {
  it('groups columns, keys, and indexes', () => {
    const children = buildTableCatalogChildren({
      connectionId: 'c1',
      schema: 'public',
      table: 'sample_items',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true },
        { name: 'name', type: 'varchar' },
      ],
      indexes: [{ name: 'sample_items_pkey', columns: ['id'], unique: true, primary: true }],
      foreignKeys: [],
    });
    expect(children.map((node) => node.name)).toEqual(['columns', 'keys', 'indexes']);
    expect(children[0]?.detail).toBe('2');
    expect(children[1]?.children?.map((node) => node.name)).toEqual(['PRIMARY']);
    expect(children[2]?.children?.map((node) => node.name)).toEqual(['sample_items_pkey']);
  });

  it('labels foreign keys with source and target columns', () => {
    const children = buildTableCatalogChildren({
      connectionId: 'c1',
      schema: 'public',
      table: 'orders',
      columns: [{ name: 'customer_id', type: 'integer' }],
      indexes: [],
      foreignKeys: [
        {
          name: 'orders_customer_id_fkey',
          table: 'orders',
          columns: ['customer_id'],
          referencedSchema: 'public',
          referencedTable: 'customers',
          referencedColumns: ['id'],
        },
      ],
    });
    const fks = children.find((node) => node.name === 'foreign keys');
    expect(fks?.children?.[0]?.detail).toBe('customer_id → public.customers.id');
  });
});

describe('buildSchemaCatalogChildren', () => {
  it('groups tables, views, and extra catalog objects', () => {
    const children = buildSchemaCatalogChildren({
      connectionId: 'c1',
      schema: 'public',
      tables: [
        { name: 'orders', schema: 'public', kind: 'table' },
        { name: 'order_summaries', schema: 'public', kind: 'view' },
      ],
      routines: [{ name: 'item_count', kind: 'function', returnType: 'integer' }],
      triggers: [{ name: 'sample_items_set_updated_at', table: 'sample_items', timing: 'BEFORE', event: 'UPDATE' }],
      sequences: [{ name: 'orders_id_seq' }],
      users: [{ name: 'testrix_ro', canLogin: true }],
      tableNav: (table) => ({
        id: table.name,
        kind: table.kind === 'view' ? 'view' : 'table',
        name: table.name,
        section: 'connections',
      }),
    });
    expect(children.map((node) => node.name)).toEqual([
      'tables',
      'views',
      'routines',
      'triggers',
      'sequences',
      'users',
    ]);
  });
});

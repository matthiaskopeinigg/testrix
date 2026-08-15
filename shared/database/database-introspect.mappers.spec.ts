import { describe, expect, it } from 'vitest';

import {
  mapCatalogColumns,
  mapCatalogForeignKeys,
  mapCatalogIndexes,
  mapCatalogSchemas,
  mapCatalogTables,
  reconstructCreateTableDdl,
} from './database-introspect.mappers';

describe('database-introspect mappers', () => {
  it('maps postgres schemas and flags system catalogs', () => {
    const schemas = mapCatalogSchemas([
      { nspname: 'public' },
      { nspname: 'pg_catalog' },
      { nspname: 'information_schema' },
    ]);
    expect(schemas).toEqual([
      { name: 'public', system: false },
      { name: 'pg_catalog', system: true },
      { name: 'information_schema', system: true },
    ]);
  });

  it('maps tables, columns, pk, and indexes from mixed engine rows', () => {
    const tables = mapCatalogTables([
      { table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' },
      { table_schema: 'public', table_name: 'active_users', table_type: 'VIEW' },
    ]);
    expect(tables).toEqual([
      { schema: 'public', name: 'users', kind: 'table' },
      { schema: 'public', name: 'active_users', kind: 'view' },
    ]);

    const columns = mapCatalogColumns([
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO', is_pk: true },
      { name: 'email', type: 'text', is_nullable: 'YES', pk: 0 },
    ]);
    expect(columns[0]).toMatchObject({ name: 'id', type: 'integer', nullable: false, primaryKey: true });
    expect(columns[1]).toMatchObject({ name: 'email', type: 'text', nullable: true, primaryKey: false });

    const indexes = mapCatalogIndexes([
      { indexname: 'users_pkey', indisunique: true, attname: 'id' },
      { indexname: 'users_email_idx', indexdef: 'CREATE INDEX users_email_idx ON users (email)' },
    ]);
    expect(indexes.find((item) => item.name === 'users_pkey')).toMatchObject({
      unique: true,
      columns: ['id'],
    });
    expect(indexes.find((item) => item.name === 'users_email_idx')?.columns).toEqual(['email']);
  });

  it('maps Oracle uppercase aliases into schemas, tables, and columns', () => {
    expect(mapCatalogSchemas([{ NAME: 'HR' }, { USERNAME: 'SCOTT' }])).toEqual([
      { name: 'HR', system: false },
      { name: 'SCOTT', system: false },
    ]);
    expect(
      mapCatalogTables([
        { TABLE_SCHEMA: 'HR', TABLE_NAME: 'EMPLOYEES', TABLE_TYPE: 'BASE TABLE' },
      ]),
    ).toEqual([{ schema: 'HR', name: 'EMPLOYEES', kind: 'table' }]);
    expect(
      mapCatalogColumns([
        { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', IS_NULLABLE: 'NO', IS_PK: 1 },
      ])[0],
    ).toMatchObject({ name: 'ID', type: 'NUMBER', nullable: false, primaryKey: true });
  });

  it('maps sqlite pragma foreign keys and reconstructs CREATE TABLE', () => {
    const fks = mapCatalogForeignKeys([
      { name: 'orders_user_id_fkey', from: 'user_id', table: 'users', to: 'id' },
    ]);
    expect(fks[0]).toMatchObject({
      columns: ['user_id'],
      refTable: 'users',
      refColumns: ['id'],
    });
    const ddl = reconstructCreateTableDdl(
      'public',
      'users',
      [{ name: 'id', type: 'integer', nullable: false, primaryKey: true }],
      'postgresql',
    );
    expect(ddl).toContain('CREATE TABLE public.users');
    expect(ddl).toContain('id integer NOT NULL PRIMARY KEY');
  });
});

import type { DatabaseType } from '../config/database-settings.schema';

import { isSystemSchemaName } from './sql-identifier';
import type {
  DatabaseCatalogColumn,
  DatabaseCatalogForeignKey,
  DatabaseCatalogIndex,
  DatabaseCatalogSchemaItem,
  DatabaseCatalogTable,
} from './database-introspect.schema';

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).length > 0) {
      return String(value);
    }
  }
  return '';
}

function bool(row: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (value === true || value === 1 || value === '1' || value === 'YES' || value === 't') {
      return true;
    }
    if (value === false || value === 0 || value === '0' || value === 'NO' || value === 'f') {
      return false;
    }
  }
  return false;
}

/** Maps driver rows into catalog schema entries. */
export function mapCatalogSchemas(
  rows: readonly Record<string, unknown>[],
): DatabaseCatalogSchemaItem[] {
  const out: DatabaseCatalogSchemaItem[] = [];
  for (const row of rows) {
    const name = str(row, 'name', 'nspname', 'schema_name', 'SCHEMA_NAME');
    if (!name) {
      continue;
    }
    out.push({ name, system: isSystemSchemaName(name) });
  }
  return out;
}

/** Maps driver rows into tables/views. */
export function mapCatalogTables(
  rows: readonly Record<string, unknown>[],
  fallbackSchema = '',
): DatabaseCatalogTable[] {
  return rows
    .map((row) => {
      const name = str(row, 'name', 'table_name', 'TABLE_NAME');
      if (!name) {
        return null;
      }
      const type = str(row, 'kind', 'table_type', 'TABLE_TYPE', 'type').toLowerCase();
      const kind = type.includes('view') ? 'view' : 'table';
      return {
        schema: str(row, 'schema', 'table_schema', 'TABLE_SCHEMA') || fallbackSchema,
        name,
        kind,
      } satisfies DatabaseCatalogTable;
    })
    .filter((item): item is DatabaseCatalogTable => item !== null);
}

/** Maps driver rows into columns. */
export function mapCatalogColumns(
  rows: readonly Record<string, unknown>[],
): DatabaseCatalogColumn[] {
  return rows
    .map((row) => {
      const name = str(row, 'name', 'column_name', 'COLUMN_NAME');
      if (!name) {
        return null;
      }
      const type = str(row, 'type', 'data_type', 'DATA_TYPE', 'udt_name') || 'unknown';
      const notnull = row['notnull'];
      const nullable =
        notnull != null
          ? Number(notnull) === 0
          : bool(row, 'nullable', 'is_nullable') || str(row, 'is_nullable', 'IS_NULLABLE') === 'YES';
      return {
        name,
        type,
        nullable,
        primaryKey:
          bool(row, 'primaryKey', 'is_pk', 'pk') ||
          Number(row['pk'] ?? 0) > 0 ||
          str(row, 'column_key', 'COLUMN_KEY') === 'PRI',
      } satisfies DatabaseCatalogColumn;
    })
    .filter((item): item is DatabaseCatalogColumn => item !== null);
}

/** Maps driver rows into indexes. */
export function mapCatalogIndexes(
  rows: readonly Record<string, unknown>[],
): DatabaseCatalogIndex[] {
  const byName = new Map<string, DatabaseCatalogIndex>();
  for (const row of rows) {
    const name = str(row, 'name', 'indexname', 'index_name', 'INDEX_NAME', 'Key_name');
    if (!name) {
      continue;
    }
    const column = str(row, 'column', 'column_name', 'COLUMN_NAME', 'attname');
    const unique = isUniqueIndex(row);
    const existing = byName.get(name);
    if (existing) {
      if (column && !existing.columns.includes(column)) {
        byName.set(name, { ...existing, columns: [...existing.columns, column] });
      }
      continue;
    }
    byName.set(name, {
      name,
      unique,
      columns: column ? [column] : splitIndexColumns(str(row, 'columns', 'indexdef')),
    });
  }
  return [...byName.values()];
}

/** Maps driver rows into foreign keys. */
export function mapCatalogForeignKeys(
  rows: readonly Record<string, unknown>[],
): DatabaseCatalogForeignKey[] {
  const byName = new Map<string, DatabaseCatalogForeignKey>();
  for (const row of rows) {
    const name = str(row, 'name', 'constraint_name', 'CONSTRAINT_NAME', 'conname') || 'fk';
    const column = str(row, 'column', 'column_name', 'COLUMN_NAME', 'from');
    const refColumn = str(row, 'refColumn', 'ref_column', 'referenced_column_name', 'REFERENCED_COLUMN_NAME', 'to');
    const refTable = str(
      row,
      'refTable',
      'ref_table',
      'referenced_table_name',
      'REFERENCED_TABLE_NAME',
      'table',
    );
    const refSchema = str(row, 'refSchema', 'ref_schema', 'referenced_table_schema', 'REFERENCED_TABLE_SCHEMA') || undefined;
    const existing = byName.get(name);
    if (existing) {
      byName.set(name, {
        ...existing,
        columns: column && !existing.columns.includes(column) ? [...existing.columns, column] : existing.columns,
        refColumns:
          refColumn && !existing.refColumns.includes(refColumn)
            ? [...existing.refColumns, refColumn]
            : existing.refColumns,
      });
      continue;
    }
    byName.set(name, {
      name,
      columns: column ? [column] : [],
      refSchema,
      refTable,
      refColumns: refColumn ? [refColumn] : [],
    });
  }
  return [...byName.values()];
}

/** Builds a CREATE TABLE sketch from columns when the engine has no native DDL. */
export function reconstructCreateTableDdl(
  schema: string,
  table: string,
  columns: readonly DatabaseCatalogColumn[],
  type: DatabaseType | null | undefined,
): string {
  const qualified =
    schema && type !== 'sqlite' && schema !== 'main' ? `${schema}.${table}` : table;
  const body = columns
    .map((column) => {
      const nullSql = column.nullable ? '' : ' NOT NULL';
      const pk = column.primaryKey ? ' PRIMARY KEY' : '';
      return `  ${column.name} ${column.type}${nullSql}${pk}`;
    })
    .join(',\n');
  return `CREATE TABLE ${qualified} (\n${body}\n);`;
}

function isUniqueIndex(row: Record<string, unknown>): boolean {
  if (Number(row['non_unique']) === 0 || str(row, 'non_unique') === '0') {
    return true;
  }
  if (bool(row, 'unique', 'indisunique')) {
    return true;
  }
  return /unique/i.test(str(row, 'indexdef'));
}

function splitIndexColumns(raw: string): string[] {
  const match = raw.match(/\(([^)]+)\)/);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split(',')
    .map((part) => part.trim().replace(/["`[\]]/g, ''))
    .filter(Boolean);
}

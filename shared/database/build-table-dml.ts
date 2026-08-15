import type { DatabaseType } from '../config/database-settings.schema';

import { qualifySqlTableName, quoteSqlIdentifier } from './sql-identifier';
import type { TableDataCell, TableDataDraft } from './table-data-edits';
import { tableDataPkKey, tableDataPkValues } from './table-data-edits';

/** One DML statement produced from a table-data draft. */
export interface TableDmlStatement {
  readonly kind: 'update' | 'insert' | 'delete';
  readonly sql: string;
}

/** Why a table cannot accept Submit DML. */
export type TableDmlRefuseReason = 'redis' | 'view' | 'no-pk';

/**
 * Returns a refuse reason when Submit must stay disabled, or `null` when DML is allowed.
 */
export function refuseTableDml(options: {
  readonly type: DatabaseType | null | undefined;
  readonly isView: boolean;
  readonly pkColumns: readonly string[];
}): TableDmlRefuseReason | null {
  if (!options.type || options.type === 'redis') {
    return 'redis';
  }
  if (options.isView) {
    return 'view';
  }
  if (options.pkColumns.length === 0) {
    return 'no-pk';
  }
  return null;
}

/** BEGIN / START TRANSACTION for the engine. */
export function tableDmlBeginSql(type: DatabaseType | null | undefined): string {
  return type === 'mssql' ? 'BEGIN TRANSACTION' : 'BEGIN';
}

/** COMMIT for the engine. */
export function tableDmlCommitSql(_type: DatabaseType | null | undefined): string {
  return 'COMMIT';
}

/** ROLLBACK for the engine. */
export function tableDmlRollbackSql(_type: DatabaseType | null | undefined): string {
  return 'ROLLBACK';
}

/**
 * Builds UPDATE / INSERT / DELETE statements from a draft. Throws when the table
 * cannot be edited (view, Redis, missing PK).
 */
export function buildTableDmlStatements(options: {
  readonly type: DatabaseType | null | undefined;
  readonly schema: string;
  readonly table: string;
  readonly isView: boolean;
  readonly columns: readonly string[];
  readonly pkColumns: readonly string[];
  readonly originalRows: readonly (readonly TableDataCell[])[];
  readonly draft: TableDataDraft;
}): TableDmlStatement[] {
  const reason = refuseTableDml(options);
  if (reason) {
    throw new Error(refuseMessage(reason));
  }
  const type = options.type;
  const qualified = qualifySqlTableName(options.schema, options.table, type);
  const pkIndexes = options.pkColumns
    .map((name) => options.columns.indexOf(name))
    .filter((index) => index >= 0);
  const originalByPk = new Map<string, readonly TableDataCell[]>();
  for (const row of options.originalRows) {
    originalByPk.set(tableDataPkKey(tableDataPkValues(row, pkIndexes)), row);
  }

  const statements: TableDmlStatement[] = [];

  for (const pkKey of options.draft.deletes) {
    const original = originalByPk.get(pkKey);
    if (!original) {
      continue;
    }
    statements.push({
      kind: 'delete',
      sql: `DELETE FROM ${qualified} WHERE ${pkWhere(options.pkColumns, pkIndexes, original, type)}`,
    });
  }

  for (const [pkKey, patch] of Object.entries(options.draft.updates)) {
    if (options.draft.deletes.includes(pkKey)) {
      continue;
    }
    const original = originalByPk.get(pkKey);
    if (!original) {
      continue;
    }
    const assignments = Object.entries(patch).map(
      ([column, value]) => `${quoteSqlIdentifier(column, type)} = ${sqlLiteral(value, type)}`,
    );
    if (assignments.length === 0) {
      continue;
    }
    statements.push({
      kind: 'update',
      sql: `UPDATE ${qualified} SET ${assignments.join(', ')} WHERE ${pkWhere(options.pkColumns, pkIndexes, original, type)}`,
    });
  }

  for (const row of options.draft.inserts) {
    const cols = options.columns.map((column) => quoteSqlIdentifier(column, type)).join(', ');
    const values = options.columns
      .map((_, index) => sqlLiteral(row[index] ?? null, type))
      .join(', ');
    statements.push({
      kind: 'insert',
      sql: `INSERT INTO ${qualified} (${cols}) VALUES (${values})`,
    });
  }

  return statements;
}

function pkWhere(
  pkColumns: readonly string[],
  pkIndexes: readonly number[],
  row: readonly TableDataCell[],
  type: DatabaseType | null | undefined,
): string {
  return pkColumns
    .map((column, i) => {
      const value = row[pkIndexes[i] ?? -1] ?? null;
      const ident = quoteSqlIdentifier(column, type);
      return value === null ? `${ident} IS NULL` : `${ident} = ${sqlLiteral(value, type)}`;
    })
    .join(' AND ');
}

/**
 * Escapes a cell as a SQL literal. NULL stays unquoted; all other values are quoted strings.
 */
export function sqlLiteral(value: TableDataCell, type: DatabaseType | null | undefined): string {
  if (value === null) {
    return 'NULL';
  }
  if (type === 'mysql') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function refuseMessage(reason: TableDmlRefuseReason): string {
  switch (reason) {
    case 'redis':
      return 'Redis keys cannot be edited in the table grid.';
    case 'view':
      return 'Views are read-only.';
    case 'no-pk':
      return 'Editing requires a primary key.';
  }
}

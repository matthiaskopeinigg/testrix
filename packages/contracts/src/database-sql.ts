import type { DatabaseType } from './database';

export type DatabaseEngineFamily =
  | 'postgresql'
  | 'mysql'
  | 'mssql'
  | 'sqlite'
  | 'oracle'
  | 'mongodb'
  | 'redis';

export function databaseEngineFamily(type: DatabaseType | null | undefined): DatabaseEngineFamily | null {
  if (!type)
    return null;
  if (type === 'mysql' || type === 'mariadb')
    return 'mysql';
  return type;
}

export type DatabaseQueryEditorLanguage = 'sql' | 'redis' | 'js';

export function databaseQueryEditorLanguage(
  type: DatabaseType | null | undefined,
): DatabaseQueryEditorLanguage {
  if (type === 'redis')
    return 'redis';
  if (type === 'mongodb')
    return 'js';
  return 'sql';
}

export function databaseQueryEditorLanguageLabel(type: DatabaseType | null | undefined): string {
  if (type === 'redis')
    return 'Redis';
  if (type === 'mongodb')
    return 'MongoDB';
  if (type === 'mssql')
    return 'SQL Server';
  if (type === 'mysql')
    return 'MySQL';
  if (type === 'mariadb')
    return 'MariaDB';
  if (type === 'sqlite')
    return 'SQLite';
  if (type === 'oracle')
    return 'Oracle';
  return 'SQL';
}

export function databaseQueryEditorPlaceholder(type: DatabaseType | null | undefined): string {
  if (type === 'redis')
    return 'SET testrix:demo:greeting "Hello from Testrix"';
  if (type === 'mongodb')
    return 'db.users.find({})';
  return 'SELECT * FROM users';
}

export type DatabaseQueryCell = string | number | boolean | null;

export interface DatabaseQueryTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly DatabaseQueryCell[])[];
  readonly hasMore: boolean;
  readonly affectedRows?: number;
}

export interface DatabaseQueryEnvelope {
  readonly table: DatabaseQueryTable;
  readonly durationMs: number;
}

export const DATABASE_QUERY_PAGE_SIZES = [50, 100, 250, 500, 1000] as const;

export const DATABASE_QUERY_PAGE_SIZE_DEFAULT = 100;

export type DatabaseQueryExportFormat = 'csv' | 'json' | 'tsv';

export const DATABASE_QUERY_EXPORT_FORMATS: readonly {
  readonly id: DatabaseQueryExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly filterName: string;
}[] = [
  { id: 'csv', label: 'CSV', extension: 'csv', filterName: 'CSV' },
  { id: 'json', label: 'JSON', extension: 'json', filterName: 'JSON' },
  { id: 'tsv', label: 'TSV', extension: 'tsv', filterName: 'TSV' },
];

export interface DatabaseQueryCellRange {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
}

export function normalizeDatabaseQueryResult(result: DatabaseQueryEnvelope | DatabaseQueryTable): DatabaseQueryTable {
  const table = 'table' in result ? result.table : result;
  return {
    columns: [...table.columns],
    rows: table.rows.map((row) => [...row]),
    hasMore: Boolean(table.hasMore),
    affectedRows: table.affectedRows,
  };
}

export function isFullDatabaseQuerySelection(
  table: DatabaseQueryTable,
  range: DatabaseQueryCellRange,
): boolean {
  return (
    range.startRow === 0 &&
    range.startCol === 0 &&
    range.endRow >= table.rows.length - 1 &&
    range.endCol >= table.columns.length - 1
  );
}

export function formatDatabaseQueryResult(
  table: DatabaseQueryTable,
  format: DatabaseQueryExportFormat,
  range: DatabaseQueryCellRange | null = null,
): string {
  const rows = sliceTable(table, range);
  if (format === 'json')
    return JSON.stringify(
      rows.map((row) => {
        const record: Record<string, DatabaseQueryCell> = {};
        table.columns.forEach((column, index) => {
          record[column] = row[index] ?? null;
        });
        return record;
      }),
      null,
      2,
    );
  const delimiter = format === 'tsv' ? '\t' : ',';
  const header = table.columns.map((column) => escapeDelimited(column, delimiter)).join(delimiter);
  const body = rows
    .map((row) => row.map((cell) => escapeDelimited(cellToText(cell), delimiter)).join(delimiter))
    .join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

function sliceTable(
  table: DatabaseQueryTable,
  range: DatabaseQueryCellRange | null,
): readonly (readonly DatabaseQueryCell[])[] {
  if (!range)
    return table.rows;
  const startRow = Math.max(0, Math.min(range.startRow, range.endRow));
  const endRow = Math.min(table.rows.length - 1, Math.max(range.startRow, range.endRow));
  const startCol = Math.max(0, Math.min(range.startCol, range.endCol));
  const endCol = Math.min(table.columns.length - 1, Math.max(range.startCol, range.endCol));
  return table.rows.slice(startRow, endRow + 1).map((row) => row.slice(startCol, endCol + 1));
}

function cellToText(value: DatabaseQueryCell): string {
  if (value === null)
    return '';
  return String(value);
}

function escapeDelimited(value: string, delimiter: string): string {
  if (!value.includes(delimiter) && !value.includes('"') && !value.includes('\n'))
    return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export type DatabaseExecuteLanguage = DatabaseQueryEditorLanguage;

export type DatabaseExecuteChooserMode = 'caret' | 'all';

export function stripTrailingSqlSemicolons(sql: string): string {
  return sql.replace(/;+\s*$/u, '').trimEnd();
}

export function resolveDatabaseExecuteQuery(input: {
  readonly source: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly language: DatabaseExecuteLanguage;
}): string {
  const source = input.source;
  const start = Math.max(0, Math.min(input.selectionStart, source.length));
  const end = Math.max(start, Math.min(input.selectionEnd, source.length));
  let resolved: string;
  if (end > start)
    resolved = source.slice(start, end).trim();
  else if (input.language === 'js')
    resolved = source.trim();
  else if (input.language === 'redis')
    resolved = extractLineAt(source, start).trim() || source.trim();
  else {
    const range = sqlStatementRangeAt(source, start);
    const executable = trimSqlExecutableRange(source, range.start, range.end);
    if (executable.end > executable.start)
      resolved = source.slice(executable.start, executable.end).trim();
    else {
      const statements = sqlStatementRanges(source);
      const last = statements[statements.length - 1];
      const lastExec = last ? trimSqlExecutableRange(source, last.start, last.end) : null;
      resolved =
        lastExec && lastExec.end > lastExec.start
          ? source.slice(lastExec.start, lastExec.end).trim()
          : source.trim();
    }
  }
  return input.language === 'sql' ? stripTrailingSqlSemicolons(resolved) : resolved;
}

export function shouldPromptDatabaseExecuteChooser(input: {
  readonly source: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly language: DatabaseExecuteLanguage;
}): boolean {
  const start = Math.max(0, Math.min(input.selectionStart, input.source.length));
  const end = Math.max(start, Math.min(input.selectionEnd, input.source.length));
  if (end > start)
    return false;
  return countDatabaseExecuteStatements(input) > 1;
}

export function countDatabaseExecuteStatements(input: {
  readonly source: string;
  readonly language: DatabaseExecuteLanguage;
}): number {
  if (input.language === 'js')
    return input.source.trim() ? 1 : 0;
  if (input.language === 'redis')
    return input.source.split('\n').filter((line) => line.trim()).length;
  return sqlStatementRanges(input.source).length;
}

export function resolveDatabaseExecuteHighlightRanges(input: {
  readonly source: string;
  readonly selectionStart: number;
  readonly language: DatabaseExecuteLanguage;
  readonly mode: DatabaseExecuteChooserMode;
}): readonly { readonly start: number; readonly end: number }[] {
  const source = input.source;
  if (input.language === 'js') {
    const range = trimSourceRange(source, 0, source.length);
    return range.end > range.start ? [range] : [];
  }
  if (input.mode === 'all') {
    if (input.language === 'redis')
      return redisExecutableLineRanges(source);
    return sqlStatementRanges(source)
      .map((range) => trimSqlExecutableRange(source, range.start, range.end))
      .filter((range) => range.end > range.start);
  }
  const caret = Math.max(0, Math.min(input.selectionStart, source.length));
  if (input.language === 'redis') {
    const range = trimSourceRange(source, ...lineRangeAt(source, caret));
    return range.end > range.start ? [range] : [];
  }
  const raw = sqlStatementRangeAt(source, caret);
  const trimmed = trimSqlExecutableRange(source, raw.start, raw.end);
  return trimmed.end > trimmed.start ? [trimmed] : [];
}

function extractLineAt(source: string, caret: number): string {
  const [start, end] = lineRangeAt(source, caret);
  return source.slice(start, end);
}

function lineRangeAt(source: string, caret: number): [number, number] {
  const lineStart = source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const nextNl = source.indexOf('\n', caret);
  const lineEnd = nextNl === -1 ? source.length : nextNl;
  return [lineStart, lineEnd];
}

function sqlStatementRangeAt(source: string, caret: number): { start: number; end: number } {
  const ranges = sqlStatementRanges(source);
  if (ranges.length === 0)
    return { start: 0, end: source.length };
  for (let i = 0; i < ranges.length; i++) {
    const next = ranges[i + 1];
    if (!next)
      return ranges[i]!;
    const nextExec = trimSqlExecutableRange(source, next.start, next.end);
    if (caret < nextExec.start)
      return ranges[i]!;
  }
  return ranges[ranges.length - 1]!;
}

function sqlStatementRanges(source: string): { start: number; end: number }[] {
  const separators = sqlSeparatorOffsets(source);
  const ranges: { start: number; end: number }[] = [];
  let rangeStart = 0;
  for (const offset of separators) {
    ranges.push({ start: rangeStart, end: offset + 1 });
    rangeStart = offset + 1;
  }
  if (rangeStart < source.length || ranges.length === 0)
    ranges.push({ start: rangeStart, end: source.length });
  return ranges.filter((range) => {
    const executable = trimSqlExecutableRange(source, range.start, range.end);
    return executable.end > executable.start;
  });
}

function redisExecutableLineRanges(source: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let lineStart = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || source[i] === '\n') {
      const trimmed = trimSourceRange(source, lineStart, i);
      if (trimmed.end > trimmed.start)
        ranges.push(trimmed);
      lineStart = i + 1;
    }
  }
  return ranges;
}

function trimSqlExecutableRange(
  source: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let from = start;
  while (from < end) {
    const ch = source[from];
    const next = source[from + 1];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      from += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      const nl = source.indexOf('\n', from + 2);
      from = nl === -1 || nl >= end ? end : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', from + 2);
      from = close === -1 || close >= end ? end : Math.min(end, close + 2);
      continue;
    }
    break;
  }
  return trimSourceRange(source, from, end);
}

function trimSourceRange(source: string, start: number, end: number): { start: number; end: number } {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(source[from] ?? ''))
    from += 1;
  while (to > from && /\s/.test(source[to - 1] ?? ''))
    to -= 1;
  return { start: from, end: to };
}

function sqlSeparatorOffsets(source: string): number[] {
  const offsets: number[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '-' && next === '-') {
      const nl = source.indexOf('\n', i + 2);
      i = nl === -1 ? source.length : nl;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (ch === "'") {
      i = skipSqlQuoted(source, i, "'");
      continue;
    }
    if (ch === '"') {
      i = skipSqlQuoted(source, i, '"');
      continue;
    }
    if (ch === '`') {
      i = skipSqlQuoted(source, i, '`');
      continue;
    }
    if (ch === ';')
      offsets.push(i);
    i += 1;
  }
  return offsets;
}

function skipSqlQuoted(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === quote) {
      if (source[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    if (quote === "'" && source[i] === '\\') {
      i += 2;
      continue;
    }
    i += 1;
  }
  return source.length;
}

const WRITE_SQL = /^(insert|update|delete|merge|replace|truncate|alter|drop|create|grant|revoke|call|do|copy|load|vacuum|analyze|optimize|attach|detach)\b/i;
const READ_SQL = /^(select|with|explain|show|describe|desc|pragma|values)\b/i;

export function isDestructiveSql(sql: string): boolean {
  const trimmed = stripLeadingSqlComments(sql);
  if (!trimmed)
    return false;
  if (READ_SQL.test(trimmed))
    return false;
  return WRITE_SQL.test(trimmed);
}

export function isTransactionalWriteSql(sql: string, type: DatabaseType | null | undefined): boolean {
  return isSqlTransactionEngine(type) && isDestructiveSql(sql);
}

export function isSqlTransactionEngine(type: DatabaseType | null | undefined): boolean {
  const family = databaseEngineFamily(type);
  return family != null && family !== 'redis' && family !== 'mongodb';
}

export type SqlTransactionControl = 'begin' | 'commit' | 'rollback';

export function sqlTransactionControl(sql: string): SqlTransactionControl | null {
  const trimmed = stripLeadingSqlComments(sql).replace(/;+\s*$/, '');
  if (/^(begin(\s+(transaction|work|tran))?|start\s+transaction)$/i.test(trimmed))
    return 'begin';
  if (/^commit(\s+(transaction|work|tran))?$/i.test(trimmed))
    return 'commit';
  if (/^rollback(\s+(transaction|work|tran))?$/i.test(trimmed))
    return 'rollback';
  return null;
}

export function shouldHoldSqlSession(sql: string, type: DatabaseType | null | undefined): boolean {
  if (!isSqlTransactionEngine(type))
    return false;
  const control = sqlTransactionControl(sql);
  return control !== 'commit' && control !== 'rollback';
}

function stripLeadingSqlComments(sql: string): string {
  return trimSqlExecutableRange(sql, 0, sql.length).start === 0
    ? sql.trim()
    : sql.slice(trimSqlExecutableRange(sql, 0, sql.length).start).trim();
}

export type TableDataCell = string | null;

export interface TableDataDraft {
  readonly updates: Readonly<Record<string, Readonly<Record<string, TableDataCell>>>>;
  readonly inserts: readonly (readonly TableDataCell[])[];
  readonly deletes: readonly string[];
}

export type TableDataRowKind = 'existing' | 'inserted' | 'deleted';

export interface TableDataDisplayRow {
  readonly kind: TableDataRowKind;
  readonly cells: readonly TableDataCell[];
  readonly pkKey: string | null;
  readonly insertIndex: number | null;
}

export function emptyTableDataDraft(): TableDataDraft {
  return { updates: {}, inserts: [], deletes: [] };
}

export function isTableDataDraftDirty(draft: TableDataDraft): boolean {
  return Object.keys(draft.updates).length > 0 || draft.inserts.length > 0 || draft.deletes.length > 0;
}

export function tableDataPkKey(values: readonly TableDataCell[]): string {
  return JSON.stringify(values);
}

export function tableDataPkIndexes(columns: readonly string[], pkColumns: readonly string[]): number[] {
  return pkColumns.map((name) => columns.indexOf(name)).filter((index) => index >= 0);
}

export function tableDataPkValues(
  row: readonly TableDataCell[],
  pkIndexes: readonly number[],
): TableDataCell[] {
  return pkIndexes.map((index) => row[index] ?? null);
}

export function canEditTableData(options: {
  readonly type: DatabaseType | null | undefined;
  readonly isView: boolean;
  readonly pkColumns: readonly string[];
}): boolean {
  if (!options.type || options.type === 'redis' || options.type === 'mongodb' || options.isView)
    return false;
  return options.pkColumns.length > 0;
}

export function applyTableDataCellEdit(
  draft: TableDataDraft,
  display: TableDataDisplayRow,
  columns: readonly string[],
  originalRow: readonly TableDataCell[] | null,
  col: number,
  value: TableDataCell,
): TableDataDraft {
  if (display.kind === 'deleted' || col < 0 || col >= columns.length)
    return draft;
  if (display.kind === 'inserted' && display.insertIndex != null) {
    const inserts = draft.inserts.map((row, index) =>
      index === display.insertIndex ? row.map((cell, cellIndex) => (cellIndex === col ? value : cell)) : row,
    );
    return { ...draft, inserts };
  }
  if (!originalRow || !display.pkKey)
    return draft;
  const column = columns[col];
  if (!column)
    return draft;
  const previous = draft.updates[display.pkKey] ?? {};
  const originalValue = originalRow[col] ?? null;
  const nextValues: Record<string, TableDataCell> = { ...previous, [column]: value };
  if (value === originalValue)
    delete nextValues[column];
  const updates = { ...draft.updates };
  if (Object.keys(nextValues).length === 0)
    delete updates[display.pkKey];
  else
    updates[display.pkKey] = nextValues;
  return { ...draft, updates };
}

export function addTableDataInsertRow(
  draft: TableDataDraft,
  columnCount: number,
  cells?: readonly TableDataCell[],
): TableDataDraft {
  return addTableDataInsertRows(draft, columnCount, [cells]);
}

export function addTableDataInsertRows(
  draft: TableDataDraft,
  columnCount: number,
  rows: readonly (readonly TableDataCell[] | undefined)[],
): TableDataDraft {
  const count = Math.max(0, columnCount);
  const inserts = rows.map((cells) =>
    Array.from({ length: count }, (_, index) => cells?.[index] ?? null),
  );
  return { ...draft, inserts: [...draft.inserts, ...inserts] };
}

export function toggleTableDataDelete(draft: TableDataDraft, display: TableDataDisplayRow): TableDataDraft {
  if (display.kind === 'inserted' && display.insertIndex != null) {
    return {
      ...draft,
      inserts: draft.inserts.filter((_, index) => index !== display.insertIndex),
    };
  }
  if (!display.pkKey)
    return draft;
  const has = draft.deletes.includes(display.pkKey);
  const deletes = has ? draft.deletes.filter((key) => key !== display.pkKey) : [...draft.deletes, display.pkKey];
  const updates = { ...draft.updates };
  if (!has)
    delete updates[display.pkKey];
  return { ...draft, deletes, updates };
}

export function applyTableDataRowDeletes(
  draft: TableDataDraft,
  displays: readonly TableDataDisplayRow[],
  mode: 'delete' | 'restore',
): TableDataDraft {
  let next = draft;
  if (mode === 'restore') {
    for (const display of displays) {
      if (display.kind === 'deleted')
        next = toggleTableDataDelete(next, display);
    }
    return next;
  }
  const inserts = displays
    .filter((display) => display.kind === 'inserted' && display.insertIndex != null)
    .sort((a, b) => (b.insertIndex ?? 0) - (a.insertIndex ?? 0));
  for (const display of inserts)
    next = toggleTableDataDelete(next, display);
  for (const display of displays) {
    if (display.kind === 'existing')
      next = toggleTableDataDelete(next, display);
  }
  return next;
}

export function buildTableDataDisplayRows(
  originalRows: readonly (readonly TableDataCell[])[],
  columns: readonly string[],
  pkIndexes: readonly number[],
  draft: TableDataDraft,
): TableDataDisplayRow[] {
  const out: TableDataDisplayRow[] = [];
  for (const row of originalRows) {
    const pkKey = pkIndexes.length > 0 ? tableDataPkKey(tableDataPkValues(row, pkIndexes)) : null;
    const deleted = pkKey !== null && draft.deletes.includes(pkKey);
    const patch = pkKey ? draft.updates[pkKey] : undefined;
    const cells = columns.map((column, index) =>
      patch && Object.prototype.hasOwnProperty.call(patch, column) ? patch[column]! : (row[index] ?? null),
    );
    out.push({ kind: deleted ? 'deleted' : 'existing', cells, pkKey, insertIndex: null });
  }
  draft.inserts.forEach((row, insertIndex) => {
    out.push({
      kind: 'inserted',
      cells: columns.map((_, index) => row[index] ?? null),
      pkKey: null,
      insertIndex,
    });
  });
  return out;
}

export type TableDmlRefuseReason = 'redis' | 'mongodb' | 'view' | 'no-pk';

export function refuseTableDml(options: {
  readonly type: DatabaseType | null | undefined;
  readonly isView: boolean;
  readonly pkColumns: readonly string[];
}): TableDmlRefuseReason | null {
  if (!options.type || options.type === 'redis')
    return 'redis';
  if (options.type === 'mongodb')
    return 'mongodb';
  if (options.isView)
    return 'view';
  if (options.pkColumns.length === 0)
    return 'no-pk';
  return null;
}

export function tableDmlBeginSql(type: DatabaseType | null | undefined): string | null {
  const family = databaseEngineFamily(type);
  if (family === 'mssql')
    return 'BEGIN TRANSACTION';
  if (family === 'oracle' || family === 'mongodb' || family === 'redis')
    return null;
  return 'BEGIN';
}

export function tableDmlCommitSql(type: DatabaseType | null | undefined): string | null {
  const family = databaseEngineFamily(type);
  if (family === 'mongodb' || family === 'redis')
    return null;
  return 'COMMIT';
}

export function tableDmlRollbackSql(type: DatabaseType | null | undefined): string | null {
  const family = databaseEngineFamily(type);
  if (family === 'mongodb' || family === 'redis')
    return null;
  return 'ROLLBACK';
}

export interface TableDmlStatement {
  readonly kind: 'update' | 'insert' | 'delete';
  readonly sql: string;
}

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
  if (reason)
    throw new Error(refuseMessage(reason));
  const type = options.type;
  const qualified = qualifySqlTableName(options.schema, options.table, type);
  const pkIndexes = tableDataPkIndexes(options.columns, options.pkColumns);
  const originalByPk = new Map<string, readonly TableDataCell[]>();
  for (const row of options.originalRows)
    originalByPk.set(tableDataPkKey(tableDataPkValues(row, pkIndexes)), row);

  const statements: TableDmlStatement[] = [];
  for (const pkKey of options.draft.deletes) {
    const original = originalByPk.get(pkKey);
    if (!original)
      continue;
    statements.push({
      kind: 'delete',
      sql: `DELETE FROM ${qualified} WHERE ${pkWhere(options.pkColumns, pkIndexes, original, type)}`,
    });
  }
  for (const [pkKey, patch] of Object.entries(options.draft.updates)) {
    if (options.draft.deletes.includes(pkKey))
      continue;
    const original = originalByPk.get(pkKey);
    if (!original)
      continue;
    const assignments = Object.entries(patch).map(
      ([column, value]) => `${quoteSqlIdentifier(column, type)} = ${sqlLiteral(value, type)}`,
    );
    if (assignments.length === 0)
      continue;
    statements.push({
      kind: 'update',
      sql: `UPDATE ${qualified} SET ${assignments.join(', ')} WHERE ${pkWhere(options.pkColumns, pkIndexes, original, type)}`,
    });
  }
  for (const row of options.draft.inserts) {
    const cols = options.columns.map((column) => quoteSqlIdentifier(column, type)).join(', ');
    const values = options.columns.map((_, index) => sqlLiteral(row[index] ?? null, type)).join(', ');
    statements.push({
      kind: 'insert',
      sql: `INSERT INTO ${qualified} (${cols}) VALUES (${values})`,
    });
  }
  return statements;
}

function refuseMessage(reason: TableDmlRefuseReason): string {
  switch (reason) {
    case 'redis':
      return 'Redis keys cannot be edited in the table grid.';
    case 'mongodb':
      return 'MongoDB collections cannot be edited in the table grid.';
    case 'view':
      return 'Views are read-only.';
    case 'no-pk':
      return 'Editing requires a primary key.';
  }
}

export function quoteSqlIdentifier(name: string, type: DatabaseType | null | undefined): string {
  const family = databaseEngineFamily(type);
  if (family === 'mysql')
    return `\`${name.replace(/`/g, '``')}\``;
  if (family === 'mssql')
    return `[${name.replace(/]/g, ']]')}]`;
  return `"${name.replace(/"/g, '""')}"`;
}

export function qualifySqlTableName(
  schema: string,
  table: string,
  type: DatabaseType | null | undefined,
): string {
  const quotedTable = quoteSqlIdentifier(table, type);
  if (!schema || schema === 'main' || schema === 'public' && databaseEngineFamily(type) === 'sqlite')
    return quotedTable;
  if (!schema)
    return quotedTable;
  return `${quoteSqlIdentifier(schema, type)}.${quotedTable}`;
}

export function sqlLiteral(value: TableDataCell, type: DatabaseType | null | undefined): string {
  if (value === null)
    return 'NULL';
  if (databaseEngineFamily(type) === 'mysql')
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  return `'${value.replace(/'/g, "''")}'`;
}

export interface DatabaseRelationJump {
  readonly schema: string;
  readonly table: string;
  readonly sourceColumns: readonly string[];
  readonly referencedColumns: readonly string[];
}

export function foreignKeyJumpByColumn(
  foreignKeys: readonly DatabaseCatalogForeignKey[],
  fallbackSchema: string,
): Readonly<Record<string, DatabaseRelationJump>> {
  const out: Record<string, DatabaseRelationJump> = {};
  for (const fk of foreignKeys) {
    const table = fk.referencedTable?.trim();
    const source = (fk.columns ?? []).map((column) => column.trim()).filter(Boolean);
    if (!table || source.length === 0)
      continue;
    const referencedRaw = (fk.referencedColumns ?? []).map((column) => column.trim()).filter(Boolean);
    const referenced = source.map((column, index) => referencedRaw[index] ?? column);
    const jump: DatabaseRelationJump = {
      schema: (fk.referencedSchema ?? fallbackSchema).trim() || fallbackSchema,
      table,
      sourceColumns: source,
      referencedColumns: referenced,
    };
    for (const column of source) {
      if (!out[column])
        out[column] = jump;
    }
  }
  return out;
}

export function buildRelationWhere(
  jump: DatabaseRelationJump,
  valuesByColumn: Readonly<Record<string, string | null>>,
  type: DatabaseType | null | undefined,
): string | null {
  if (jump.sourceColumns.length === 0)
    return null;
  const parts: string[] = [];
  for (let i = 0; i < jump.sourceColumns.length; i++) {
    const source = jump.sourceColumns[i] ?? '';
    const ref = jump.referencedColumns[i] ?? source;
    if (!ref || !(source in valuesByColumn))
      return null;
    const value = valuesByColumn[source] ?? null;
    const ident = quoteSqlIdentifier(ref, type);
    parts.push(value === null ? `${ident} IS NULL` : `${ident} = ${sqlLiteral(value, type)}`);
  }
  return parts.join(' AND ');
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

export function buildTableDataSelectSql(options: {
  readonly schema: string;
  readonly table: string;
  readonly type: DatabaseType | null | undefined;
  readonly filter: string;
  readonly order?: string;
}): string {
  const qualified = qualifySqlTableName(options.schema, options.table, options.type);
  const where = options.filter.trim();
  const order = (options.order ?? '').trim();
  let sql = `SELECT * FROM ${qualified}`;
  if (where)
    sql += ` WHERE ${where}`;
  if (order)
    sql += ` ORDER BY ${order}`;
  return sql;
}

export function normalizeTableDataWhereFilter(raw: string): string {
  return raw.trim().replace(/^where\s+/i, '');
}

export function normalizeTableDataOrderBy(raw: string): string {
  return raw.trim().replace(/^order\s+by\s+/i, '');
}

export function tableDataWhereFilterError(
  raw: string,
  type: DatabaseType | null | undefined,
): string | null {
  return tableDataClauseError(raw, type, 'WHERE only accepts a filter expression.');
}

export function tableDataOrderByError(
  raw: string,
  type: DatabaseType | null | undefined,
): string | null {
  return tableDataClauseError(raw, type, 'ORDER BY only accepts a sort expression.');
}

function tableDataClauseError(
  raw: string,
  type: DatabaseType | null | undefined,
  invalid: string,
): string | null {
  const family = databaseEngineFamily(type);
  if (family === 'redis' || family === 'mongodb')
    return 'Use a query tab for this engine.';
  const value = raw.trim();
  if (!value)
    return null;
  if (/;\s*$/.test(value) || /\b(drop|delete|update|insert|alter)\b/i.test(value))
    return invalid;
  return null;
}

export type DatabaseIntrospectLevel =
  | 'schemas'
  | 'tables'
  | 'columns'
  | 'indexes'
  | 'foreignKeys'
  | 'ddl'
  | 'routines'
  | 'triggers'
  | 'sequences'
  | 'users';

export interface DatabaseCatalogColumn {
  readonly name: string;
  readonly type?: string;
  readonly primaryKey?: boolean;
  readonly nullable?: boolean;
}

export interface DatabaseCatalogTable {
  readonly name: string;
  readonly kind: 'table' | 'view';
  readonly schema: string;
}

export interface DatabaseCatalogIndex {
  readonly name: string;
  readonly columns?: readonly string[];
  readonly unique?: boolean;
  readonly primary?: boolean;
}

export interface DatabaseCatalogForeignKey {
  readonly name: string;
  readonly table?: string;
  readonly columns?: readonly string[];
  readonly referencedSchema?: string;
  readonly referencedTable?: string;
  readonly referencedColumns?: readonly string[];
}

export interface DatabaseCatalogRoutine {
  readonly name: string;
  readonly kind: 'function' | 'procedure';
  readonly args?: string;
  readonly returnType?: string;
}

export interface DatabaseCatalogTrigger {
  readonly name: string;
  readonly table?: string;
  readonly timing?: string;
  readonly event?: string;
}

export interface DatabaseCatalogSequence {
  readonly name: string;
}

export interface DatabaseCatalogUser {
  readonly name: string;
  readonly canLogin?: boolean;
}

export interface DatabaseIntrospectResult {
  readonly schemas?: readonly string[];
  readonly tables?: readonly DatabaseCatalogTable[];
  readonly columns?: readonly DatabaseCatalogColumn[];
  readonly indexes?: readonly DatabaseCatalogIndex[];
  readonly foreignKeys?: readonly DatabaseCatalogForeignKey[];
  readonly routines?: readonly DatabaseCatalogRoutine[];
  readonly triggers?: readonly DatabaseCatalogTrigger[];
  readonly sequences?: readonly DatabaseCatalogSequence[];
  readonly users?: readonly DatabaseCatalogUser[];
  readonly ddl?: string;
}

export type DatabaseConnectionStatusState = 'unknown' | 'checking' | 'connected' | 'error';

export interface DatabaseConnectionStatus {
  readonly state: DatabaseConnectionStatusState;
  readonly message?: string;
}

export type DatabaseConnectionStatusMap = Readonly<Record<string, DatabaseConnectionStatus>>;

export interface DatabaseQueryRequest {
  readonly connection: import('./database').DatabaseConnection;
  readonly query: string;
  readonly page?: { readonly limit: number; readonly offset: number };
  readonly paramNames?: readonly string[];
  readonly paramValues?: readonly unknown[];
  readonly timeoutMs?: number;
}

export interface DatabaseSessionQueryRequest {
  readonly tabId: string;
  readonly connection: import('./database').DatabaseConnection;
  readonly query: string;
  readonly page?: { readonly limit: number; readonly offset: number };
  readonly timeoutMs?: number;
  readonly hold?: boolean;
}

export interface DatabaseSessionState {
  readonly tabId: string;
  readonly open: boolean;
  readonly uncommitted: boolean;
  readonly rollbackAt: number | null;
}

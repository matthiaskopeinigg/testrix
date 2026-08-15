import type { DatabaseQueryTable } from './normalize-query-result';

/** Inclusive cell range in a query result grid. */
export interface DatabaseQueryCellRange {
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}

export const DATABASE_QUERY_EXPORT_FORMAT_IDS = [
  'csv',
  'tsv',
  'json',
  'markdown',
  'html',
] as const;

export type DatabaseQueryExportFormat = (typeof DATABASE_QUERY_EXPORT_FORMAT_IDS)[number];

export interface DatabaseQueryExportFormatMeta {
  readonly id: DatabaseQueryExportFormat;
  readonly label: string;
  readonly extension: string;
  readonly filterName: string;
}

/** Formats offered by the Query tab Export menu. */
export const DATABASE_QUERY_EXPORT_FORMATS: readonly DatabaseQueryExportFormatMeta[] = [
  { id: 'csv', label: 'CSV', extension: 'csv', filterName: 'CSV' },
  { id: 'tsv', label: 'TSV', extension: 'tsv', filterName: 'TSV' },
  { id: 'json', label: 'JSON', extension: 'json', filterName: 'JSON' },
  { id: 'markdown', label: 'Markdown', extension: 'md', filterName: 'Markdown' },
  { id: 'html', label: 'HTML', extension: 'html', filterName: 'HTML' },
];

type QueryTableSlice = Pick<DatabaseQueryTable, 'columns' | 'rows'>;

/**
 * Normalizes a cell range so start is the top-left corner and end is the bottom-right.
 */
export function normalizeDatabaseQueryCellRange(range: DatabaseQueryCellRange): DatabaseQueryCellRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  };
}

/**
 * Returns true when `range` covers every cell in the table.
 */
export function isFullDatabaseQuerySelection(
  table: QueryTableSlice,
  range: DatabaseQueryCellRange | null | undefined,
): boolean {
  if (!range || table.columns.length === 0 || table.rows.length === 0) {
    return true;
  }
  const normalized = normalizeDatabaseQueryCellRange(range);
  return (
    normalized.startRow === 0 &&
    normalized.startCol === 0 &&
    normalized.endRow === table.rows.length - 1 &&
    normalized.endCol === table.columns.length - 1
  );
}

/**
 * Slices columns and rows to `range`. When `range` is omitted, returns the full table.
 */
export function sliceDatabaseQueryTable(
  table: QueryTableSlice,
  range?: DatabaseQueryCellRange | null,
): QueryTableSlice {
  if (!range || table.columns.length === 0) {
    return { columns: table.columns, rows: table.rows };
  }
  const normalized = normalizeDatabaseQueryCellRange(range);
  const startCol = clampIndex(normalized.startCol, table.columns.length);
  const endCol = clampIndex(normalized.endCol, table.columns.length);
  const startRow = clampIndex(normalized.startRow, table.rows.length);
  const endRow = clampIndex(normalized.endRow, table.rows.length);
  return {
    columns: table.columns.slice(startCol, endCol + 1),
    rows: table.rows.slice(startRow, endRow + 1).map((row) => row.slice(startCol, endCol + 1)),
  };
}

/**
 * Serializes a query result (or selection) to the given export format.
 */
export function formatDatabaseQueryResult(
  table: QueryTableSlice,
  format: DatabaseQueryExportFormat,
  range?: DatabaseQueryCellRange | null,
): string {
  const slice = sliceDatabaseQueryTable(table, range);
  switch (format) {
    case 'csv':
      return formatDelimited(slice, ',', { includeHeader: true });
    case 'tsv':
      return formatDelimited(slice, '\t', { includeHeader: true });
    case 'json':
      return formatJson(slice);
    case 'markdown':
      return formatMarkdown(slice);
    case 'html':
      return formatHtml(slice);
  }
}

/**
 * Copies selected cells as TSV without a header row (DataGrip / Excel paste).
 */
export function formatDatabaseQueryClipboardTsv(
  table: QueryTableSlice,
  range?: DatabaseQueryCellRange | null,
): string {
  return formatDelimited(sliceDatabaseQueryTable(table, range), '\t', { includeHeader: false });
}

function clampIndex(value: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, value));
}

function formatDelimited(
  table: QueryTableSlice,
  delimiter: string,
  options: { readonly includeHeader: boolean },
): string {
  const lines: string[] = [];
  if (options.includeHeader) {
    lines.push(table.columns.map((column) => escapeDelimited(column, delimiter)).join(delimiter));
  }
  for (const row of table.rows) {
    lines.push(row.map((cell) => escapeDelimited(cell ?? '', delimiter)).join(delimiter));
  }
  return lines.join('\n');
}

function escapeDelimited(value: string, delimiter: string): string {
  const needsQuotes =
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    (delimiter !== '\t' && value.includes(delimiter)) ||
    (delimiter === '\t' && value.includes('\t'));
  if (!needsQuotes) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function formatJson(table: QueryTableSlice): string {
  const records = table.rows.map((row) => {
    const record: Record<string, string | null> = {};
    table.columns.forEach((column, index) => {
      record[column] = row[index] ?? null;
    });
    return record;
  });
  return `${JSON.stringify(records, null, 2)}\n`;
}

function formatMarkdown(table: QueryTableSlice): string {
  if (table.columns.length === 0) {
    return '';
  }
  const header = `| ${table.columns.map(escapeMarkdownCell).join(' | ')} |`;
  const divider = `| ${table.columns.map(() => '---').join(' | ')} |`;
  const body = table.rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function markdownCell(value: string | null): string {
  if (value === null) {
    return 'NULL';
  }
  return escapeMarkdownCell(value);
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\r\n', ' ').replaceAll('\n', ' ').replaceAll('\r', ' ');
}

function formatHtml(table: QueryTableSlice): string {
  const head = table.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join('');
  const body = table.rows
    .map((row) => `<tr>${row.map(htmlCell).join('')}</tr>`)
    .join('');
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody>\n</table>\n`;
}

function htmlCell(value: string | null): string {
  if (value === null) {
    return '<td><i>NULL</i></td>';
  }
  return `<td>${escapeHtml(value)}</td>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

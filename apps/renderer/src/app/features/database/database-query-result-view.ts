import type { DatabaseQueryCell, DatabaseQueryTable } from '@testrix/contracts';

export interface QueryResultOrderKey {
  readonly column: string;
  readonly descending: boolean;
}

export function inferSqlFromTable(sql: string): { readonly schema: string; readonly table: string } | null {
  const text = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const match = /\bfrom\s+(?!\()(?:("?)([A-Za-z_][\w$]*)\1\.)?("?)([A-Za-z_][\w$]*)\3/i.exec(text);
  if (!match?.[4])
    return null;
  return { schema: match[2] ?? '', table: match[4] };
}

export function parseQueryResultOrder(raw: string): readonly QueryResultOrderKey[] {
  const value = raw.trim().replace(/^order\s+by\s+/i, '');
  if (!value)
    return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const tokens = part.split(/\s+/);
      const column = (tokens[0] ?? '').replace(/^["'`[]+|["'`\]]+$/g, '');
      const dir = (tokens[1] ?? '').toLowerCase();
      return { column, descending: dir === 'desc' || dir === 'descending' };
    })
    .filter((item) => item.column.length > 0);
}

export function applyQueryResultView(
  table: DatabaseQueryTable,
  where: string,
  order: string,
): DatabaseQueryTable {
  const filtered = filterQueryResultRows(table, where);
  const keys = parseQueryResultOrder(order);
  if (keys.length === 0)
    return filtered;
  const indexes = keys
    .map((key) => ({
      index: filtered.columns.findIndex((column) => column.toLowerCase() === key.column.toLowerCase()),
      descending: key.descending,
    }))
    .filter((item) => item.index >= 0);
  if (indexes.length === 0)
    return filtered;
  const rows = [...filtered.rows].sort((left, right) => {
    for (const key of indexes) {
      const delta = compareQueryCells(left[key.index] ?? null, right[key.index] ?? null);
      if (delta !== 0)
        return key.descending ? -delta : delta;
    }
    return 0;
  });
  return { ...filtered, rows };
}

function filterQueryResultRows(table: DatabaseQueryTable, where: string): DatabaseQueryTable {
  const trimmed = where.trim().replace(/^where\s+/i, '');
  if (!trimmed)
    return table;
  const comparison = /^(["'`[]?)([A-Za-z_][\w$]*)\1\s*(=|!=|<>|>=|<=|>|<)\s*(.*)$/.exec(trimmed);
  if (comparison) {
    const column = comparison[2] ?? '';
    const op = comparison[3] ?? '=';
    const raw = (comparison[4] ?? '').trim().replace(/^['"]|['"]$/g, '');
    const index = table.columns.findIndex((item) => item.toLowerCase() === column.toLowerCase());
    if (index < 0)
      return { ...table, rows: [] };
    return {
      ...table,
      rows: table.rows.filter((row) => matchQueryComparison(row[index] ?? null, op, raw)),
    };
  }
  const needle = trimmed.toLowerCase();
  return {
    ...table,
    rows: table.rows.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(needle))),
  };
}

function matchQueryComparison(cell: DatabaseQueryCell, op: string, expected: string): boolean {
  if (op === '=')
    return String(cell ?? '') === expected;
  if (op === '!=' || op === '<>')
    return String(cell ?? '') !== expected;
  const delta = compareQueryCells(cell, coerceQueryCell(expected));
  if (op === '>')
    return delta > 0;
  if (op === '<')
    return delta < 0;
  if (op === '>=')
    return delta >= 0;
  return delta <= 0;
}

function coerceQueryCell(value: string): DatabaseQueryCell {
  if (value === 'NULL')
    return null;
  if (value === 'true' || value === 'false')
    return value === 'true';
  if (value.trim() !== '' && Number.isFinite(Number(value)))
    return Number(value);
  return value;
}

function compareQueryCells(left: DatabaseQueryCell, right: DatabaseQueryCell): number {
  if (left == null && right == null)
    return 0;
  if (left == null)
    return -1;
  if (right == null)
    return 1;
  if (typeof left === 'number' && typeof right === 'number')
    return left - right;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (String(left).trim() !== '' && String(right).trim() !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
    return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

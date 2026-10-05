import { applyClauseSuggestion, pairSqlKey, sqlTokenAt, unpairSqlKey } from './database-clause-complete';

export { applyClauseSuggestion, pairSqlKey, sqlTokenAt, unpairSqlKey };

export type SqlSuggestionKind = 'keyword' | 'schema' | 'table' | 'column' | 'routine';

export interface SqlSuggestion {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: SqlSuggestionKind;
}

export interface SqlCompleteContext {
  readonly schemas: readonly string[];
  readonly tables: readonly { readonly schema: string; readonly name: string }[];
  readonly columns: readonly { readonly name: string; readonly type?: string; readonly table?: string }[];
  readonly routines: readonly { readonly name: string; readonly kind?: string }[];
}

export type SqlHighlightKind = 'text' | 'keyword' | 'string' | 'comment' | 'number';

export interface SqlHighlightToken {
  readonly kind: SqlHighlightKind;
  readonly text: string;
}

export const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'ON',
  'GROUP',
  'BY',
  'ORDER',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'AS',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'DISTINCT',
  'UNION',
  'ALL',
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'VIEW',
  'INDEX',
  'EXPLAIN',
  'WITH',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'EXISTS',
  'IN',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'ASC',
  'DESC',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'RETURNING',
  'TRUE',
  'FALSE',
] as const;

const KEYWORD_SET = new Set(SQL_KEYWORDS.map((item) => item.toLowerCase()));
const RELATION_HEAD = /\b(from|join|into|update|table)\s+$/i;

export function suggestSql(value: string, cursor: number, context: SqlCompleteContext): SqlSuggestion[] {
  const token = sqlTokenAt(value, cursor);
  const raw = token.text.replace(/^["'`]+|["'`]+$/g, '');
  const dot = raw.lastIndexOf('.');
  const qualifier = dot >= 0 ? raw.slice(0, dot) : '';
  const needle = (dot >= 0 ? raw.slice(dot + 1) : raw).toLowerCase();
  const before = value.slice(0, token.start);
  const inRelation = RELATION_HEAD.test(before) || qualifier.length > 0;
  const keywords: SqlSuggestion[] = SQL_KEYWORDS.map((keyword) => ({
    value: keyword,
    label: keyword,
    detail: 'keyword',
    kind: 'keyword' as const,
  }));
  const schemas: SqlSuggestion[] = context.schemas.filter(Boolean).map((schema) => ({
    value: schema,
    label: schema,
    detail: 'schema',
    kind: 'schema' as const,
  }));
  const tables: SqlSuggestion[] = context.tables.map((table) => ({
    value: table.name,
    label: table.schema ? `${table.schema}.${table.name}` : table.name,
    detail: 'table',
    kind: 'table' as const,
  }));
  const columns: SqlSuggestion[] = context.columns.map((column) => ({
    value: column.name,
    label: column.name,
    detail: column.type ? `column · ${column.type}` : 'column',
    kind: 'column' as const,
  }));
  const routines: SqlSuggestion[] = context.routines.map((routine) => ({
    value: routine.name,
    label: routine.name,
    detail: routine.kind ? `routine · ${routine.kind}` : 'routine',
    kind: 'routine' as const,
  }));
  const qualifierLower = qualifier.toLowerCase();
  const tableForQualifier = qualifierLower
    ? context.tables.find((table) => table.name.toLowerCase() === qualifierLower)
    : undefined;
  let pool: SqlSuggestion[];
  if (tableForQualifier)
    pool = columns;
  else if (qualifierLower)
    pool = tables.filter((table) => {
      const schema = context.tables.find((item) => item.name === table.value)?.schema ?? '';
      return schema.toLowerCase() === qualifierLower || table.label.toLowerCase().startsWith(`${qualifierLower}.`);
    });
  else if (inRelation)
    pool = [...tables, ...schemas];
  else if (needle)
    pool = [...tables, ...columns, ...routines, ...schemas, ...keywords];
  else
    pool = [...keywords, ...tables, ...schemas, ...routines];
  const filtered = needle
    ? pool.filter(
        (item) =>
          item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle),
      )
    : pool;
  const seen = new Set<string>();
  const unique: SqlSuggestion[] = [];
  for (const item of filtered) {
    const key = `${item.kind}:${item.value.toLowerCase()}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 16)
      break;
  }
  return unique;
}

export function sqlGhost(
  value: string,
  cursor: number,
  suggestion: SqlSuggestion | null | undefined,
): { readonly pad: string; readonly rest: string } | null {
  if (!suggestion)
    return null;
  const token = sqlTokenAt(value, cursor);
  if (cursor !== token.end)
    return null;
  const raw = token.text.replace(/^["'`]+|["'`]+$/g, '');
  const dot = raw.lastIndexOf('.');
  const typed = (dot >= 0 ? raw.slice(dot + 1) : raw);
  if (!typed) {
    if (dot < 0 && !RELATION_HEAD.test(value.slice(0, cursor)))
      return null;
    return { pad: value.slice(0, cursor), rest: suggestion.value };
  }
  if (!suggestion.value.toLowerCase().startsWith(typed.toLowerCase()))
    return null;
  if (suggestion.value.length === typed.length)
    return null;
  return {
    pad: value.slice(0, cursor),
    rest: suggestion.value.slice(typed.length),
  };
}

export function applySqlSuggestion(
  value: string,
  cursor: number,
  insert: string,
): { readonly value: string; readonly cursor: number } {
  const token = sqlTokenAt(value, cursor);
  const raw = token.text;
  const dot = raw.lastIndexOf('.');
  const start = dot >= 0 ? token.start + dot + 1 : token.start;
  const next = `${value.slice(0, start)}${insert}${value.slice(token.end)}`;
  return { value: next, cursor: start + insert.length };
}

export function tokenizeSqlHighlight(source: string): SqlHighlightToken[] {
  const tokens: SqlHighlightToken[] = [];
  let index = 0;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === '--') {
      const end = source.indexOf('\n', index);
      const stop = end < 0 ? source.length : end;
      tokens.push({ kind: 'comment', text: source.slice(index, stop) });
      index = stop;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end < 0 ? source.length : end + 2;
      tokens.push({ kind: 'comment', text: source.slice(index, stop) });
      index = stop;
      continue;
    }
    const quote = source[index];
    if (quote === "'" || quote === '"' || quote === '`') {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === quote) {
          if (source[cursor + 1] === quote) {
            cursor += 2;
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      tokens.push({ kind: 'string', text: source.slice(index, cursor) });
      index = cursor;
      continue;
    }
    if (isDigit(source[index] ?? '') && (index === 0 || !isIdentChar(source[index - 1] ?? ''))) {
      let cursor = index + 1;
      while (cursor < source.length && /[0-9.]/.test(source[cursor] ?? ''))
        cursor += 1;
      tokens.push({ kind: 'number', text: source.slice(index, cursor) });
      index = cursor;
      continue;
    }
    if (isIdentStart(source[index] ?? '')) {
      let cursor = index + 1;
      while (cursor < source.length && isIdentChar(source[cursor] ?? ''))
        cursor += 1;
      const text = source.slice(index, cursor);
      tokens.push({ kind: KEYWORD_SET.has(text.toLowerCase()) ? 'keyword' : 'text', text });
      index = cursor;
      continue;
    }
    tokens.push({ kind: 'text', text: source[index] ?? '' });
    index += 1;
  }
  return mergeText(tokens);
}

export function formatSql(source: string): string {
  const tokens = tokenizeSqlHighlight(source);
  let out = '';
  for (const token of tokens) {
    if (token.kind === 'comment') {
      out += token.text;
      continue;
    }
    if (/^\s+$/.test(token.text))
      continue;
    const text = token.kind === 'keyword' ? token.text.toUpperCase() : token.kind === 'string' ? token.text : token.text.trim();
    if (!text)
      continue;
    if (out && !/[\s(]$/.test(out) && !/^[,).;]/.test(text))
      out += ' ';
    out += text;
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

function mergeText(tokens: readonly SqlHighlightToken[]): SqlHighlightToken[] {
  const out: SqlHighlightToken[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === 'text' && token.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: last.text + token.text };
      continue;
    }
    out.push(token);
  }
  return out;
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isIdentStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

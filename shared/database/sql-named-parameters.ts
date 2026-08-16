import type { DatabaseEngineFamily } from './database-engine';

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface NamedParameterRewrite {
  readonly sql: string;
  readonly names: readonly string[];
}

/**
 * Returns unique `:name` tokens in appearance order, ignoring strings, comments, and `::` casts.
 */
export function extractNamedParameterNames(sql: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  scanSql(sql, (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  });
  return names;
}

/**
 * Rewrites `:name` tokens to engine bind placeholders.
 */
export function rewriteNamedParameters(
  sql: string,
  family: DatabaseEngineFamily,
  names: readonly string[],
): NamedParameterRewrite {
  if (names.length === 0) {
    return { sql, names };
  }
  const indexByName = new Map(names.map((name, index) => [name, index] as const));
  let out = '';
  let last = 0;
  scanSql(sql, (name, start, end) => {
    out += sql.slice(last, start);
    const index = indexByName.get(name) ?? 0;
    out += placeholderFor(family, name, index);
    last = end;
  });
  out += sql.slice(last);
  return { sql: out, names };
}

function placeholderFor(family: DatabaseEngineFamily, name: string, index: number): string {
  switch (family) {
    case 'postgresql':
      return `$${index + 1}`;
    case 'mysql':
      return '?';
    case 'sqlite':
      return `:${name}`;
    case 'mssql':
      return `@${name}`;
    case 'oracle':
      return `:${name}`;
    case 'clickhouse':
      return `{${name}:String}`;
    default:
      return `:${name}`;
  }
}

function scanSql(
  sql: string,
  onParam: (name: string, start: number, end: number) => void,
): void {
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      i = skipUntil(sql, i + 2, '\n');
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (ch === '\'') {
      i = skipQuoted(sql, i, '\'');
      continue;
    }
    if (ch === '"') {
      i = skipQuoted(sql, i, '"');
      continue;
    }
    if (ch === '`') {
      i = skipQuoted(sql, i, '`');
      continue;
    }
    if (ch === ':' && next === ':') {
      i += 2;
      continue;
    }
    if (ch === ':' && next && /[A-Za-z_]/.test(next)) {
      let end = i + 1;
      while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end] ?? '')) {
        end += 1;
      }
      const name = sql.slice(i + 1, end);
      if (NAME_RE.test(name)) {
        onParam(name, i, end);
      }
      i = end;
      continue;
    }
    i += 1;
  }
}

function skipUntil(sql: string, from: number, stop: string): number {
  const at = sql.indexOf(stop, from);
  return at < 0 ? sql.length : at + stop.length;
}

function skipQuoted(sql: string, from: number, quote: string): number {
  let i = from + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

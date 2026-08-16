export const DESTRUCTIVE_SQL_KINDS = ['UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER'] as const;

export type DestructiveSqlKind = (typeof DESTRUCTIVE_SQL_KINDS)[number];

const DESTRUCTIVE_SET = new Set<string>(DESTRUCTIVE_SQL_KINDS);

/**
 * Returns the destructive verb for a SQL statement, or null when it looks safe.
 * Strings and comments are ignored.
 */
export function detectDestructiveSql(sql: string): DestructiveSqlKind | null {
  const keywords = collectKeywords(sql);
  if (keywords.length === 0) {
    return null;
  }
  const first = keywords[0];
  if (first && DESTRUCTIVE_SET.has(first)) {
    return first as DestructiveSqlKind;
  }
  if (first === 'WITH') {
    const hit = keywords.find((word) => DESTRUCTIVE_SET.has(word));
    return (hit as DestructiveSqlKind | undefined) ?? null;
  }
  return null;
}

function collectKeywords(sql: string): string[] {
  const words: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i + 2);
      i = nl < 0 ? sql.length : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      i = skipQuoted(sql, i, ch);
      continue;
    }
    if (/[A-Za-z_]/.test(ch ?? '')) {
      let end = i + 1;
      while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end] ?? '')) {
        end += 1;
      }
      words.push(sql.slice(i, end).toUpperCase());
      i = end;
      continue;
    }
    i += 1;
  }
  return words;
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

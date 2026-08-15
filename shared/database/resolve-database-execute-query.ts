import { stripTrailingSqlSemicolons } from './strip-trailing-sql-semicolons';

/**
 * Resolves which SQL/Redis text to execute (DataGrip-style).
 * Selection wins; otherwise the statement or line at the caret.
 * Trailing `;` is stripped for SQL so Oracle and similar drivers do not raise ORA-00911.
 */
export function resolveDatabaseExecuteQuery(input: {
  readonly source: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly language: 'sql' | 'redis' | 'js';
}): string {
  const source = input.source;
  const start = Math.max(0, Math.min(input.selectionStart, source.length));
  const end = Math.max(start, Math.min(input.selectionEnd, source.length));
  let resolved: string;
  if (end > start) {
    resolved = source.slice(start, end).trim();
  } else {
    const caret = start;
    if (input.language === 'js') {
      resolved = source.trim();
    } else {
      const extracted =
        input.language === 'redis' ? extractLineAt(source, caret) : extractSqlStatementAt(source, caret);
      const trimmed = extracted.trim();
      if (trimmed) {
        resolved = trimmed;
      } else if (input.language === 'sql' && caret > 0) {
        const previous = extractSqlStatementAt(source, caret - 1).trim();
        resolved = previous || source.trim();
      } else {
        resolved = source.trim();
      }
    }
  }
  return input.language === 'sql' ? stripTrailingSqlSemicolons(resolved) : resolved;
}

function extractLineAt(source: string, caret: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const nextNl = source.indexOf('\n', caret);
  const lineEnd = nextNl === -1 ? source.length : nextNl;
  return source.slice(lineStart, lineEnd);
}

function extractSqlStatementAt(source: string, caret: number): string {
  const separators = sqlSeparatorOffsets(source);
  let rangeStart = 0;
  for (const offset of separators) {
    if (offset < caret) {
      rangeStart = offset + 1;
      continue;
    }
    return source.slice(rangeStart, offset + 1);
  }
  return source.slice(rangeStart);
}

/** Offsets of `;` tokens that are not inside strings or comments. */
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
    if (ch === ';') {
      offsets.push(i);
    }
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

import { stripTrailingSqlSemicolons } from './strip-trailing-sql-semicolons';

export type DatabaseExecuteLanguage = 'sql' | 'redis' | 'js';

export type DatabaseExecuteChooserMode = 'caret' | 'all';

/**
 * Resolves which SQL/Redis text to execute (DataGrip-style).
 * Selection wins; otherwise the statement or line at the caret.
 * Trailing `;` is stripped for SQL so Oracle and similar drivers do not raise ORA-00911.
 */
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
  if (end > start) {
    resolved = source.slice(start, end).trim();
  } else if (input.language === 'js') {
    resolved = source.trim();
  } else if (input.language === 'redis') {
    resolved = extractLineAt(source, start).trim() || source.trim();
  } else {
    const range = sqlStatementRangeAt(source, start);
    const executable = trimSqlExecutableRange(source, range.start, range.end);
    if (executable.end > executable.start) {
      resolved = source.slice(executable.start, executable.end).trim();
    } else {
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

/**
 * True when Ctrl+Enter should ask what to run (DataGrip “Ask what to execute”).
 * A non-empty selection always runs as-is, with no chooser.
 */
export function shouldPromptDatabaseExecuteChooser(input: {
  readonly source: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly language: DatabaseExecuteLanguage;
}): boolean {
  const start = Math.max(0, Math.min(input.selectionStart, input.source.length));
  const end = Math.max(start, Math.min(input.selectionEnd, input.source.length));
  if (end > start) {
    return false;
  }
  return countDatabaseExecuteStatements(input) > 1;
}

/** Number of non-empty statements (SQL) or lines (Redis). Mongo/JS counts as one script. */
export function countDatabaseExecuteStatements(input: {
  readonly source: string;
  readonly language: DatabaseExecuteLanguage;
}): number {
  if (input.language === 'js') {
    return input.source.trim() ? 1 : 0;
  }
  if (input.language === 'redis') {
    return input.source.split('\n').filter((line) => line.trim()).length;
  }
  return sqlStatementRanges(input.source).length;
}

/**
 * Source ranges to highlight while the execute chooser is open.
 * `caret` is the executable statement or line at the caret; `all` is each
 * executable statement (comments and blank lines are omitted).
 */
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
    if (input.language === 'redis') {
      return redisExecutableLineRanges(source);
    }
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

/**
 * Statement that owns the caret. Trivia after a `;` (same-line space, blank
 * lines, comments) stays with the previous statement until the next SQL token.
 */
function sqlStatementRangeAt(source: string, caret: number): { start: number; end: number } {
  const ranges = sqlStatementRanges(source);
  if (ranges.length === 0) {
    return { start: 0, end: source.length };
  }
  for (let i = 0; i < ranges.length; i++) {
    const next = ranges[i + 1];
    if (!next) {
      return ranges[i];
    }
    const nextExec = trimSqlExecutableRange(source, next.start, next.end);
    if (caret < nextExec.start) {
      return ranges[i];
    }
  }
  return ranges[ranges.length - 1];
}

function sqlStatementRanges(source: string): { start: number; end: number }[] {
  const separators = sqlSeparatorOffsets(source);
  const ranges: { start: number; end: number }[] = [];
  let rangeStart = 0;
  for (const offset of separators) {
    ranges.push({ start: rangeStart, end: offset + 1 });
    rangeStart = offset + 1;
  }
  if (rangeStart < source.length || ranges.length === 0) {
    ranges.push({ start: rangeStart, end: source.length });
  }
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
      if (trimmed.end > trimmed.start) {
        ranges.push(trimmed);
      }
      lineStart = i + 1;
    }
  }
  return ranges;
}

/**
 * Drops leading comments/whitespace so execute preview covers only SQL text.
 */
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

function trimSourceRange(
  source: string,
  start: number,
  end: number,
): { start: number; end: number } {
  let from = start;
  let to = end;
  while (from < to && /\s/.test(source[from] ?? '')) {
    from += 1;
  }
  while (to > from && /\s/.test(source[to - 1] ?? '')) {
    to -= 1;
  }
  return { start: from, end: to };
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

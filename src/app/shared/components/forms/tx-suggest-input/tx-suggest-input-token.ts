/**
 * Identifier under the caret for token-scoped autocomplete (SQL WHERE, etc.).
 */
export interface SuggestInputToken {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const COLUMN_INTRO_KEYWORDS = new Set(['AND', 'OR', 'XOR', 'NOT', 'WHERE', 'HAVING', 'ON']);

/**
 * Returns the `[A-Za-z_][A-Za-z0-9_]*` token touching {@link caret}.
 */
export function lastIdentifierToken(value: string, caret: number): SuggestInputToken {
  const pos = Math.max(0, Math.min(caret, value.length));
  let start = pos;
  while (start > 0 && /[A-Za-z0-9_]/.test(value.charAt(start - 1))) {
    start -= 1;
  }
  if (start < pos && /[0-9]/.test(value.charAt(start))) {
    return { start: pos, end: pos, text: '' };
  }
  let end = pos;
  while (end < value.length && /[A-Za-z0-9_]/.test(value.charAt(end))) {
    end += 1;
  }
  return { start, end, text: value.slice(start, end) };
}

/**
 * True when {@link caret} sits inside a SQL single-quoted string (`''` is an escaped quote).
 */
export function isInsideSqlSingleQuotes(value: string, caret: number): boolean {
  let inside = false;
  const limit = Math.max(0, Math.min(caret, value.length));
  for (let i = 0; i < limit; i++) {
    if (value.charAt(i) !== "'") {
      continue;
    }
    if (inside && value.charAt(i + 1) === "'") {
      i += 1;
      continue;
    }
    inside = !inside;
  }
  return inside;
}

/**
 * True when identifier suggestions must stay off: inside `'…'` or on the opening quote.
 */
export function isSqlStringLiteralContext(value: string, caret: number): boolean {
  if (isInsideSqlSingleQuotes(value, caret)) {
    return true;
  }
  const pos = Math.max(0, Math.min(caret, value.length));
  return value.charAt(pos) === "'" && isInsideSqlSingleQuotes(value, pos + 1);
}

/**
 * True when a column name is a valid next token (start of the clause, after AND/OR/NOT, or after `(`).
 */
export function canSuggestSqlColumn(value: string, caret: number): boolean {
  if (isSqlStringLiteralContext(value, caret)) {
    return false;
  }
  const { start } = lastIdentifierToken(value, caret);
  const prev = lastCompleteSqlToken(value, start);
  if (prev === null || prev === '(') {
    return true;
  }
  if (prev === 'NOT') {
    const notStart = trailingKeywordStart(value, start, 'NOT');
    const beforeNot = lastCompleteSqlToken(value, notStart);
    return beforeNot !== 'IS' && (beforeNot === null || beforeNot === '(' || COLUMN_INTRO_KEYWORDS.has(beforeNot));
  }
  if (prev === 'AND' && isBetweenAndClause(value, start)) {
    return false;
  }
  return COLUMN_INTRO_KEYWORDS.has(prev);
}

/** Last finished token before {@link end}, skipping trailing whitespace. */
function lastCompleteSqlToken(value: string, end: number): string | null {
  let i = Math.max(0, Math.min(end, value.length));
  while (i > 0 && /\s/.test(value.charAt(i - 1))) {
    i -= 1;
  }
  if (i <= 0) {
    return null;
  }
  const last = value.charAt(i - 1);
  if (last === "'") {
    return 'STRING';
  }
  if (last === '(') {
    return '(';
  }
  if (last === ')') {
    return ')';
  }
  if (last === '"' || last === '`') {
    return 'IDENT';
  }
  if (/[=<>!~]/.test(last)) {
    return 'OP';
  }
  let start = i;
  while (start > 0 && /[A-Za-z0-9_]/.test(value.charAt(start - 1))) {
    start -= 1;
  }
  if (start >= i) {
    return last;
  }
  if (/^[0-9]/.test(value.charAt(start))) {
    return 'NUMBER';
  }
  return value.slice(start, i).toUpperCase();
}

/** Start index of a trailing keyword immediately before {@link end}. */
function trailingKeywordStart(value: string, end: number, keyword: string): number {
  let i = Math.max(0, Math.min(end, value.length));
  while (i > 0 && /\s/.test(value.charAt(i - 1))) {
    i -= 1;
  }
  const start = i - keyword.length;
  if (start < 0) {
    return 0;
  }
  if (value.slice(start, i).toUpperCase() !== keyword.toUpperCase()) {
    return i;
  }
  return start;
}

/** Start index of the last token immediately before {@link end}. */
function trailingTokenStart(value: string, end: number): number {
  let i = Math.max(0, Math.min(end, value.length));
  while (i > 0 && /\s/.test(value.charAt(i - 1))) {
    i -= 1;
  }
  if (i <= 0) {
    return 0;
  }
  const last = value.charAt(i - 1);
  if (last === "'") {
    i -= 1;
    while (i > 0) {
      if (value.charAt(i - 1) !== "'") {
        i -= 1;
        continue;
      }
      if (i > 1 && value.charAt(i - 2) === "'") {
        i -= 2;
        continue;
      }
      return i - 1;
    }
    return 0;
  }
  if (/[A-Za-z0-9_]/.test(last)) {
    while (i > 0 && /[A-Za-z0-9_]/.test(value.charAt(i - 1))) {
      i -= 1;
    }
    return i;
  }
  while (i > 0 && /[=<>!]/.test(value.charAt(i - 1))) {
    i -= 1;
  }
  return i;
}

/** True when {@link identStart} follows `BETWEEN <operand> AND`. */
function isBetweenAndClause(value: string, identStart: number): boolean {
  if (lastCompleteSqlToken(value, identStart) !== 'AND') {
    return false;
  }
  const andStart = trailingKeywordStart(value, identStart, 'AND');
  const operandStart = trailingTokenStart(value, andStart);
  return lastCompleteSqlToken(value, operandStart) === 'BETWEEN';
}

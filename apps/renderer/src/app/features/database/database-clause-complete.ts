export type ClauseCompleteMode = 'where' | 'order';

export interface ClauseSuggestion {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
  readonly kind: 'column' | 'keyword' | 'schema' | 'table' | 'routine';
}

export interface ClauseCompleteContext {
  readonly columns: readonly { readonly name: string; readonly type?: string }[];
  readonly schemas: readonly string[];
  readonly tables: readonly { readonly schema: string; readonly name: string }[];
  readonly currentSchema: string;
  readonly currentTable: string;
  readonly mode: ClauseCompleteMode;
}

export interface ClauseGhost {
  readonly pad: string;
  readonly rest: string;
}

const PAIR: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  '`': '`',
  '(': ')',
};

const WHERE_KEYWORDS = ['AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'BETWEEN', 'EXISTS'];
const ORDER_KEYWORDS = ['ASC', 'DESC', 'NULLS', 'FIRST', 'LAST'];

export function sqlTokenAt(
  value: string,
  cursor: number,
): { readonly start: number; readonly end: number; readonly text: string } {
  const index = Math.max(0, Math.min(cursor, value.length));
  let start = index;
  let end = index;
  while (start > 0 && isIdentChar(value[start - 1] ?? ''))
    start -= 1;
  while (end < value.length && isIdentChar(value[end] ?? ''))
    end += 1;
  return { start, end, text: value.slice(start, end) };
}

export function suggestClause(value: string, cursor: number, context: ClauseCompleteContext): ClauseSuggestion[] {
  const token = sqlTokenAt(value, cursor).text.replace(/^["'`]+|["'`]+$/g, '');
  const needle = token.toLowerCase();
  const items: ClauseSuggestion[] = [
    ...context.columns.map((column) => ({
      value: column.name,
      label: column.name,
      detail: column.type ? `column · ${column.type}` : 'column',
      kind: 'column' as const,
    })),
    ...(context.mode === 'order' ? ORDER_KEYWORDS : WHERE_KEYWORDS).map((keyword) => ({
      value: keyword,
      label: keyword,
      detail: 'keyword',
      kind: 'keyword' as const,
    })),
  ];
  if (context.currentSchema)
    items.push({
      value: context.currentSchema,
      label: context.currentSchema,
      detail: 'schema',
      kind: 'schema',
    });
  if (context.currentTable) {
    const qualified = context.currentSchema
      ? `${context.currentSchema}.${context.currentTable}`
      : context.currentTable;
    items.push({
      value: qualified,
      label: qualified,
      detail: 'table',
      kind: 'table',
    });
  }
  for (const schema of context.schemas) {
    if (schema && schema !== context.currentSchema)
      items.push({ value: schema, label: schema, detail: 'schema', kind: 'schema' });
  }
  for (const table of context.tables) {
    const qualified = table.schema ? `${table.schema}.${table.name}` : table.name;
    if (qualified === `${context.currentSchema}.${context.currentTable}`)
      continue;
    items.push({ value: qualified, label: qualified, detail: 'table', kind: 'table' });
  }
  const filtered = needle
    ? items.filter((item) => item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
    : items;
  const seen = new Set<string>();
  const unique: ClauseSuggestion[] = [];
  for (const item of filtered) {
    const key = `${item.kind}:${item.value.toLowerCase()}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 12)
      break;
  }
  return unique;
}

export function clauseGhost(
  value: string,
  cursor: number,
  suggestion: ClauseSuggestion | null | undefined,
): ClauseGhost | null {
  if (!suggestion)
    return null;
  const token = sqlTokenAt(value, cursor);
  if (!token.text || cursor !== token.end)
    return null;
  const typed = token.text;
  if (!suggestion.value.toLowerCase().startsWith(typed.toLowerCase()))
    return null;
  if (suggestion.value.length === typed.length)
    return null;
  return {
    pad: value.slice(0, cursor),
    rest: suggestion.value.slice(typed.length),
  };
}

export function applyClauseSuggestion(
  value: string,
  cursor: number,
  insert: string,
): { readonly value: string; readonly cursor: number } {
  const token = sqlTokenAt(value, cursor);
  const next = `${value.slice(0, token.start)}${insert}${value.slice(token.end)}`;
  return { value: next, cursor: token.start + insert.length };
}

export function pairSqlKey(
  value: string,
  cursor: number,
  key: string,
): { readonly value: string; readonly cursor: number } | null {
  if (key === ')' || key === "'" || key === '"' || key === '`') {
    if (isInsidePair(value, cursor, key) && value[cursor] === key)
      return { value, cursor: cursor + 1 };
  }
  const closer = PAIR[key];
  if (!closer)
    return null;
  if ((key === "'" || key === '"' || key === '`') && !isInsidePair(value, cursor, key) && value[cursor] === key) {
    return {
      value: `${value.slice(0, cursor)}${key}${value.slice(cursor)}`,
      cursor: cursor + 1,
    };
  }
  return {
    value: `${value.slice(0, cursor)}${key}${closer}${value.slice(cursor)}`,
    cursor: cursor + 1,
  };
}

export function unpairSqlKey(
  value: string,
  cursor: number,
): { readonly value: string; readonly cursor: number } | null {
  if (cursor <= 0)
    return null;
  const opener = value[cursor - 1] ?? '';
  const closer = PAIR[opener];
  if (!closer || value[cursor] !== closer)
    return null;
  return {
    value: `${value.slice(0, cursor - 1)}${value.slice(cursor + 1)}`,
    cursor: cursor - 1,
  };
}

function isInsidePair(value: string, cursor: number, quote: string): boolean {
  if (quote === ')') {
    const open = countChar(value, cursor, '(');
    const close = countChar(value, cursor, ')');
    return open > close && value[cursor] === ')';
  }
  return countChar(value, cursor, quote) % 2 === 1;
}

function countChar(value: string, cursor: number, char: string): number {
  let count = 0;
  for (let i = 0; i < cursor; i++) {
    if (value[i] === char && value[i - 1] !== '\\')
      count += 1;
  }
  return count;
}

function isIdentChar(char: string): boolean {
  return /[A-Za-z0-9_."`]/.test(char);
}

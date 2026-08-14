import { TX_CODE_EDITOR_TAB_SIZE } from './tx-code-editor-keyboard';
import type { TxCodeEditorLanguage } from './tx-code-editor-language';

export type JsonBracket = '{' | '[';
export type JsonBracketClose = '}' | ']';

export type JsonEnterPlan =
  | { readonly type: 'plain'; readonly indent: string }
  | {
      readonly type: 'line-break';
      readonly contentIndent: string;
      readonly closeIndent: string;
      readonly close: JsonBracketClose;
    }
  | {
      readonly type: 'expand-block';
      readonly contentIndent: string;
      readonly closeIndent: string;
      readonly close: JsonBracketClose;
    };

export type MarkupEnterPlan =
  | { readonly type: 'plain'; readonly indent: string }
  | {
      readonly type: 'line-break';
      readonly contentIndent: string;
      readonly closeIndent: string;
      readonly closeTag: string;
    }
  | {
      readonly type: 'expand-block';
      readonly contentIndent: string;
      readonly closeIndent: string;
      readonly closeTag: string;
    };

const MARKUP_LANGUAGES = new Set<TxCodeEditorLanguage>(['html', 'xml']);

const CLOSE_TO_OPEN: Readonly<Record<string, string>> = {
  '"': '"',
  "'": "'",
  '}': '{',
  ']': '[',
  ')': '(',
  '>': '<',
};

/** True when non-whitespace at caret is already the closing delimiter. */
export function delimiterCloserAhead(value: string, caret: number, close: string): boolean {
  let i = caret;
  while (i < value.length && /\s/.test(value[i]!)) {
    i++;
  }
  return value[i] === close;
}

/** True when caret sits inside a JSON string literal. */
export function isInJsonString(value: string, caret: number): boolean {
  let i = 0;
  while (i < caret) {
    if (value[i] === '"') {
      const end = skipJsonString(value, i);
      if (caret > i && caret < end) {
        return true;
      }
      i = end;
      continue;
    }
    i++;
  }
  return false;
}

export function jsonEnclosingOpenerAtCaret(
  value: string,
  caret: number,
): { readonly ch: JsonBracket; readonly index: number } | null {
  const stack: { ch: JsonBracket; index: number }[] = [];
  let i = 0;
  while (i < caret) {
    if (value[i] === '"') {
      i = skipJsonString(value, i);
      continue;
    }
    const ch = value[i];
    if (ch === '{' || ch === '[') {
      stack.push({ ch, index: i });
    } else if (ch === '}' && stack.length > 0 && stack[stack.length - 1]!.ch === '{') {
      stack.pop();
    } else if (ch === ']' && stack.length > 0 && stack[stack.length - 1]!.ch === '[') {
      stack.pop();
    }
    i++;
  }
  return stack[stack.length - 1] ?? null;
}

export function hasJsonCloserAhead(value: string, caret: number, opener: JsonBracket): boolean {
  const close: JsonBracketClose = opener === '{' ? '}' : ']';
  return delimiterCloserAhead(value, caret, close);
}

export function jsonQuoteContextAtCaret(
  value: string,
  caret: number,
): 'outside' | 'inside-string' | 'empty-string' {
  if (caret > 0 && value[caret - 1] === '"' && !hasUnescapedQuoteAfter(value, caret - 1)) {
    return 'empty-string';
  }

  if (isInJsonString(value, caret)) {
    return 'inside-string';
  }
  return 'outside';
}

/**
 * Plans JSON Enter behavior after validation (no duplicate closers, string-safe).
 * Returns null to defer to native Enter inside strings.
 */
export function planJsonEnter(
  value: string,
  caret: number,
  lineBeforeCaret: string,
): JsonEnterPlan | null {
  if (isInJsonString(value, caret)) {
    return null;
  }

  const baseIndent = lineLeadingWhitespace(lineBeforeCaret);
  const trimmedEnd = lineBeforeCaret.trimEnd();
  const lineOpener = trimmedEnd.at(-1);

  if (lineOpener === '{' || lineOpener === '[') {
    const contentIndent = baseIndent + indentUnit();
    if (hasJsonCloserAhead(value, caret, lineOpener)) {
      const close: JsonBracketClose = lineOpener === '{' ? '}' : ']';
      return { type: 'line-break', contentIndent, closeIndent: baseIndent, close };
    }
    return {
      type: 'expand-block',
      contentIndent,
      closeIndent: baseIndent,
      close: lineOpener === '{' ? '}' : ']',
    };
  }

  const enclosing = jsonEnclosingOpenerAtCaret(value, caret);
  if (enclosing && hasJsonCloserAhead(value, caret, enclosing.ch)) {
    const openerLineStart = value.lastIndexOf('\n', enclosing.index) + 1;
    const openerLineEnd = value.indexOf('\n', enclosing.index);
    const openerLine = value.slice(
      openerLineStart,
      openerLineEnd === -1 ? value.length : openerLineEnd,
    );
    const openerIndent = lineLeadingWhitespace(openerLine);
    const close: JsonBracketClose = enclosing.ch === '{' ? '}' : ']';
    return {
      type: 'line-break',
      contentIndent: openerIndent + indentUnit(),
      closeIndent: openerIndent,
      close,
    };
  }

  return { type: 'plain', indent: baseIndent };
}

/**
 * Plans XML/HTML Enter: content line + closing tag on its own line at opener indent.
 */
export function planMarkupEnter(
  value: string,
  caret: number,
  lineBeforeCaret: string,
): MarkupEnterPlan {
  const baseIndent = lineLeadingWhitespace(lineBeforeCaret);
  const trimmedEnd = lineBeforeCaret.trimEnd();

  if (/\/>\s*$/.test(trimmedEnd)) {
    return { type: 'plain', indent: baseIndent };
  }

  const tagFromLine = openingTagNameFromLine(lineBeforeCaret);
  if (tagFromLine && trimmedEnd.endsWith('>')) {
    const contentIndent = baseIndent + indentUnit();
    if (markupClosingTagAhead(value, caret, tagFromLine)) {
      return { type: 'line-break', contentIndent, closeIndent: baseIndent, closeTag: tagFromLine };
    }
    return {
      type: 'expand-block',
      contentIndent,
      closeIndent: baseIndent,
      closeTag: tagFromLine,
    };
  }

  const enclosing = enclosingMarkupOpenTagAtCaret(value, caret);
  if (enclosing && markupClosingTagAhead(value, caret, enclosing.tag)) {
    return {
      type: 'line-break',
      contentIndent: enclosing.indent + indentUnit(),
      closeIndent: enclosing.indent,
      closeTag: enclosing.tag,
    };
  }

  return { type: 'plain', indent: baseIndent };
}

export function applyMarkupEnterPlan(
  value: string,
  caret: number,
  plan: MarkupEnterPlan,
): { readonly value: string; readonly selectionStart: number; readonly selectionEnd: number } {
  switch (plan.type) {
    case 'plain': {
      const insert = '\n' + plan.indent;
      const next = value.slice(0, caret) + insert + value.slice(caret);
      const pos = caret + insert.length;
      return { value: next, selectionStart: pos, selectionEnd: pos };
    }
    case 'line-break':
      return applyMarkupLineBreakWithCloser(value, caret, plan);
    case 'expand-block': {
      const closeLiteral = markupCloseLiteral(plan.closeTag);
      const tail = `\n${plan.closeIndent}${closeLiteral}`;
      const insert = `\n${plan.contentIndent}${tail}`;
      const next = value.slice(0, caret) + insert + value.slice(caret);
      const pos = caret + insert.length - closeLiteral.length;
      return { value: next, selectionStart: pos, selectionEnd: pos };
    }
    default:
      return { value, selectionStart: caret, selectionEnd: caret };
  }
}

function applyMarkupLineBreakWithCloser(
  value: string,
  caret: number,
  plan: Extract<MarkupEnterPlan, { readonly type: 'line-break' }>,
): { readonly value: string; readonly selectionStart: number; readonly selectionEnd: number } {
  const closeLiteral = markupCloseLiteral(plan.closeTag);
  let closeIndex = caret;
  while (closeIndex < value.length && /\s/.test(value[closeIndex]!)) {
    closeIndex++;
  }

  const insert = '\n' + plan.contentIndent;
  if (!value.startsWith(closeLiteral, closeIndex)) {
    const next = value.slice(0, caret) + insert + value.slice(caret);
    const pos = caret + insert.length;
    return { value: next, selectionStart: pos, selectionEnd: pos };
  }

  if (closerOnSameLine(value, caret, closeIndex, closeLiteral.length)) {
    const after = value.slice(closeIndex + closeLiteral.length);
    const next =
      value.slice(0, caret) +
      insert +
      '\n' +
      plan.closeIndent +
      closeLiteral +
      after;
    const pos = caret + insert.length;
    return { value: next, selectionStart: pos, selectionEnd: pos };
  }

  const closeLineStart = value.lastIndexOf('\n', closeIndex) + 1;
  const closeLineEnd = value.indexOf('\n', closeIndex);
  const closeLineEndEx = closeLineEnd === -1 ? value.length : closeLineEnd;
  const next =
    value.slice(0, caret) +
    insert +
    value.slice(caret, closeLineStart) +
    plan.closeIndent +
    closeLiteral +
    value.slice(closeLineEndEx);
  const pos = caret + insert.length;
  return { value: next, selectionStart: pos, selectionEnd: pos };
}

function openingTagNameFromLine(line: string): string | null {
  const m = line.trimEnd().match(/<([A-Za-z][\w:.-]*)(?:\s[^>/]*)?>\s*$/);
  return m?.[1] ?? null;
}

function enclosingMarkupOpenTagAtCaret(
  value: string,
  caret: number,
): { readonly tag: string; readonly indent: string } | null {
  const before = value.slice(0, caret);
  const matches = [...before.matchAll(/<([A-Za-z][\w:.-]*)(?:\s[^>]*)?>/g)];
  const opens = matches.filter((m) => !m[0].endsWith('/>'));
  const last = opens[opens.length - 1];
  if (!last?.[1] || last.index === undefined) {
    return null;
  }
  const lineStart = before.lastIndexOf('\n', last.index) + 1;
  return {
    tag: last[1],
    indent: lineLeadingWhitespace(before.slice(lineStart, last.index)),
  };
}

function markupCloseLiteral(tag: string): string {
  return `</${tag}>`;
}

function closerOnSameLine(
  value: string,
  caret: number,
  closeIndex: number,
  closeLength: number,
): boolean {
  const lineBreak = value.indexOf('\n', caret);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  return closeIndex + closeLength <= lineEnd;
}

/**
 * Inserts a content line at caret and realigns an existing closing bracket line.
 */
function jsonCloserOnSameLine(value: string, caret: number, closeIndex: number): boolean {
  const lineBreak = value.indexOf('\n', caret);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  return closeIndex < lineEnd;
}

export function applyJsonLineBreakWithCloser(
  value: string,
  caret: number,
  plan: Extract<JsonEnterPlan, { readonly type: 'line-break' }>,
): { readonly value: string; readonly selectionStart: number; readonly selectionEnd: number } {
  let closeIndex = caret;
  while (closeIndex < value.length && /\s/.test(value[closeIndex]!)) {
    closeIndex++;
  }

  const insert = '\n' + plan.contentIndent;
  if (value[closeIndex] !== plan.close) {
    const next = value.slice(0, caret) + insert + value.slice(caret);
    const pos = caret + insert.length;
    return { value: next, selectionStart: pos, selectionEnd: pos };
  }

  /** Auto-close `[]` on one line — move `]` to its own line instead of duplicating it. */
  if (jsonCloserOnSameLine(value, caret, closeIndex)) {
    const after = value.slice(closeIndex + 1);
    const next =
      value.slice(0, caret) +
      insert +
      '\n' +
      plan.closeIndent +
      plan.close +
      after;
    const pos = caret + insert.length;
    return { value: next, selectionStart: pos, selectionEnd: pos };
  }

  const closeLineStart = value.lastIndexOf('\n', closeIndex) + 1;
  const closeLineEnd = value.indexOf('\n', closeIndex);
  const closeLineEndEx = closeLineEnd === -1 ? value.length : closeLineEnd;
  const next =
    value.slice(0, caret) +
    insert +
    value.slice(caret, closeLineStart) +
    plan.closeIndent +
    plan.close +
    value.slice(closeLineEndEx);
  const pos = caret + insert.length;
  return { value: next, selectionStart: pos, selectionEnd: pos };
}

/** Whether auto-inserting `open+close` at caret is appropriate. */
export function canAutoCloseDelimiterPair(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
  open: string,
  close: string,
): boolean {
  if (delimiterCloserAhead(value, caret, close)) {
    return false;
  }

  if (language === 'json') {
    if (open === '"' && isInJsonString(value, caret)) {
      return false;
    }
    if ((open === '{' || open === '[') && isInJsonString(value, caret)) {
      return false;
    }
    return true;
  }

  if (MARKUP_LANGUAGES.has(language) && (open === '"' || open === "'") && isInsideMarkupTagName(value, caret)) {
    return false;
  }

  return true;
}

/** Whether typing a closing key should skip over an existing closer at caret. */
export function canSkipClosingDelimiterAtCaret(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
  closeKey: string,
): boolean {
  if (value[caret] !== closeKey) {
    return false;
  }

  const openKey = CLOSE_TO_OPEN[closeKey];
  if (!openKey) {
    return false;
  }

  if (language === 'json' && (closeKey === ']' || closeKey === '}')) {
    const expected: JsonBracket = closeKey === ']' ? '[' : '{';
    const enclosing = jsonEnclosingOpenerAtCaret(value, caret);
    return enclosing?.ch === expected;
  }

  if (closeKey === '"' || closeKey === "'") {
    if (language === 'json' && closeKey === "'") {
      return false;
    }
    return true;
  }

  if (language === 'json' && (closeKey === ']' || closeKey === '}')) {
    const expected: JsonBracket = closeKey === ']' ? '[' : '{';
    const enclosing = jsonEnclosingOpenerAtCaret(value, caret);
    return enclosing?.ch === expected;
  }

  return closeKey === ')' || closeKey === ']' || closeKey === '}';
}

export function canAutoCloseMarkupTag(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
): { readonly tag: string; readonly void: boolean } | null {
  if (!MARKUP_LANGUAGES.has(language)) {
    return null;
  }

  const before = value.slice(0, caret);
  const tag = matchIncompleteMarkupTag(before);
  if (!tag) {
    return null;
  }

  if (markupClosingTagAhead(value, caret, tag)) {
    return null;
  }

  const isVoid = language === 'html' && HTML_VOID_ELEMENTS.has(tag.toLowerCase());
  return { tag, void: isVoid };
}

export function canRemoveEmptyDelimiterPair(
  value: string,
  caret: number,
  open: string,
  close: string,
): boolean {
  const start = caret - open.length;
  if (start < 0) {
    return false;
  }
  return value.slice(start, caret) === open && value.slice(caret, caret + close.length) === close;
}

function markupClosingTagAhead(value: string, caret: number, tagName: string): boolean {
  const after = value.slice(caret).trimStart();
  return after.startsWith(`</${tagName}>`) || new RegExp(`^</${escapeRegExp(tagName)}[\\s>/]`).test(after);
}

function matchIncompleteMarkupTag(before: string): string | null {
  if (/<!$/.test(before) || /<\?[^?]*$/.test(before) || /<!--[\s\S]*$/.test(before)) {
    return null;
  }
  const match = before.match(/<(\/?)([A-Za-z][\w:.-]*)([^<]*)$/);
  if (!match || match[1] === '/') {
    return null;
  }
  const tagName = match[2] ?? '';
  if (!tagName) {
    return null;
  }
  const tail = match[3] ?? '';
  if (tail.includes('>')) {
    return null;
  }
  return tagName;
}

function isInsideMarkupTagName(value: string, caret: number): boolean {
  const before = value.slice(0, caret);
  const lastOpen = before.lastIndexOf('<');
  if (lastOpen < 0) {
    return false;
  }
  return /^<[A-Za-z][\w:.-]*$/.test(before.slice(lastOpen));
}

function isInMarkupAttributeValue(value: string, caret: number): boolean {
  const before = value.slice(0, caret);
  const lastOpen = before.lastIndexOf('<');
  if (lastOpen < 0) {
    return true;
  }
  const tagChunk = before.slice(lastOpen);
  if (!tagChunk.includes('>') && /=\s*["']?[^"'>]*$/.test(tagChunk)) {
    return true;
  }
  if (/"[^"]*$/.test(tagChunk) || /'[^']*$/.test(tagChunk)) {
    return true;
  }
  return !isInsideMarkupTagName(value, caret);
}

function hasUnescapedQuoteAfter(value: string, openIndex: number): boolean {
  let i = openIndex + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === '"') {
      return true;
    }
    i++;
  }
  return false;
}

function lineLeadingWhitespace(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? '';
}

function indentUnit(): string {
  return ' '.repeat(TX_CODE_EDITOR_TAB_SIZE);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skipJsonString(value: string, start: number): number {
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === '"') {
      return i + 1;
    }
    i++;
  }
  return value.length;
}

const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

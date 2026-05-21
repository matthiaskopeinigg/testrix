import type { TxCodeEditorEditResult, TxCodeEditorSelection } from './tx-code-editor-keyboard';
import type { TxCodeEditorLanguage } from './tx-code-editor-language';
import {
  canAutoCloseDelimiterPair,
  canAutoCloseMarkupTag,
  canRemoveEmptyDelimiterPair,
  canSkipClosingDelimiterAtCaret,
  jsonQuoteContextAtCaret,
} from './tx-code-editor-edit-validation';

export interface TxCodeEditorAutoCloseParams {
  readonly key: string;
  readonly value: string;
  readonly selection: TxCodeEditorSelection;
  readonly language: TxCodeEditorLanguage;
}

const MARKUP_LANGUAGES = new Set<TxCodeEditorLanguage>(['html', 'xml']);

/**
 * Inserts closing delimiters for brackets, quotes, and markup tags.
 * Returns null to allow native textarea behavior.
 */
export function resolveTxCodeEditorAutoClose(
  params: TxCodeEditorAutoCloseParams,
): TxCodeEditorEditResult | null {
  const { key, value, selection, language } = params;
  if (selection.start !== selection.end || key.length !== 1) {
    return null;
  }
  const caret = selection.start;

  if (canSkipClosingDelimiterAtCaret(value, caret, language, key)) {
    return advanceCaret(value, caret + 1);
  }

  if (key === '>' && MARKUP_LANGUAGES.has(language)) {
    return resolveMarkupTagAutoClose(value, caret, language);
  }

  return resolveDelimiterAutoClose(value, caret, key, language);
}

/** Deletes empty auto-inserted pairs (e.g. `""`, `{}`, `<a></a>`). */
export function resolveTxCodeEditorAutoCloseBackspace(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
): TxCodeEditorEditResult | null {
  if (caret < 2) {
    return null;
  }

  for (const [open, close] of delimiterPairsForLanguage(language)) {
    if (!canRemoveEmptyDelimiterPair(value, caret, open, close)) {
      continue;
    }
    const start = caret - open.length;
    return replaceRange(value, start, caret + close.length, '', 0);
  }

  if (MARKUP_LANGUAGES.has(language)) {
    return resolveMarkupTagAutoCloseBackspace(value, caret);
  }

  return null;
}

function resolveDelimiterAutoClose(
  value: string,
  caret: number,
  key: string,
  language: TxCodeEditorLanguage,
): TxCodeEditorEditResult | null {
  for (const [open, close] of delimiterPairsForLanguage(language)) {
    if (key !== open) {
      continue;
    }
    if (language === 'json' && open === '"') {
      return resolveJsonQuoteAutoClose(value, caret);
    }
    if (!canAutoCloseDelimiterPair(value, caret, language, open, close)) {
      return null;
    }
    return replaceRange(value, caret, caret, open + close, close.length);
  }
  return null;
}

function resolveJsonQuoteAutoClose(value: string, caret: number): TxCodeEditorEditResult | null {
  const context = jsonQuoteContextAtCaret(value, caret);
  if (context === 'inside-string') {
    return null;
  }
  if (context === 'empty-string') {
    return replaceRange(value, caret, caret, '"', 0);
  }
  if (!canAutoCloseDelimiterPair(value, caret, 'json', '"', '"')) {
    return null;
  }
  return replaceRange(value, caret, caret, '""', 1);
}

function resolveMarkupTagAutoClose(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
): TxCodeEditorEditResult | null {
  const plan = canAutoCloseMarkupTag(value, caret, language);
  if (!plan) {
    return null;
  }

  const before = value.slice(0, caret);
  if (before.endsWith('/')) {
    return replaceRange(value, caret, caret, '>', 0);
  }

  if (plan.void) {
    return replaceRange(value, caret, caret, ' />', 2);
  }

  const insert = `></${plan.tag}>`;
  return replaceRange(value, caret, caret, insert, `</${plan.tag}>`.length);
}

function resolveMarkupTagAutoCloseBackspace(
  value: string,
  caret: number,
): TxCodeEditorEditResult | null {
  const after = value.slice(caret);
  const closeMatch = after.match(/^<\/([A-Za-z][\w:.-]*)>/);
  if (!closeMatch) {
    return null;
  }
  const tag = closeMatch[1] ?? '';
  if (!tag) {
    return null;
  }
  const before = value.slice(0, caret);
  if (!before.endsWith(`<${tag}>`)) {
    return null;
  }
  const start = before.length - tag.length - 2;
  const removeEnd = caret + closeMatch[0].length;
  return replaceRange(value, start, removeEnd, `<${tag}`, 0);
}

function delimiterPairsForLanguage(language: TxCodeEditorLanguage): readonly (readonly [string, string])[] {
  switch (language) {
    case 'json':
      return [
        ['"', '"'],
        ['{', '}'],
        ['[', ']'],
      ];
    case 'html':
    case 'xml':
      return [
        ['"', '"'],
        ["'", "'"],
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ];
    case 'graphql':
      return [
        ['"', '"'],
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ];
    case 'js':
    case 'ts':
    case 'css':
    case 'scss':
      return [
        ['"', '"'],
        ["'", "'"],
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ];
    case 'plaintext':
      return [
        ['"', '"'],
        ["'", "'"],
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ];
    default:
      return [];
  }
}

function advanceCaret(value: string, caret: number): TxCodeEditorEditResult {
  return { value, selectionStart: caret, selectionEnd: caret };
}

function replaceRange(
  value: string,
  start: number,
  end: number,
  insert: string,
  caretOffsetFromEnd: number,
): TxCodeEditorEditResult {
  const next = value.slice(0, start) + insert + value.slice(end);
  const caret = start + insert.length - caretOffsetFromEnd;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

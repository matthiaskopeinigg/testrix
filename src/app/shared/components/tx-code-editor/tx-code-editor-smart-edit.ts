import {
  TX_CODE_EDITOR_TAB_SIZE,
  type TxCodeEditorEditResult,
  type TxCodeEditorSelection,
} from './tx-code-editor-keyboard';
import type { TxCodeEditorLanguage } from './tx-code-editor-language';
import {
  applyJsonLineBreakWithCloser,
  applyMarkupEnterPlan as applyMarkupEnterEdit,
  planJsonEnter,
  planMarkupEnter,
} from './tx-code-editor-edit-validation';

export interface TxCodeEditorSmartEditParams {
  readonly key: string;
  readonly value: string;
  readonly selection: TxCodeEditorSelection;
  readonly language: TxCodeEditorLanguage;
}

const SCRIPT_LANGUAGES = new Set<TxCodeEditorLanguage>(['js', 'ts', 'css', 'scss']);
const MARKUP_LANGUAGES = new Set<TxCodeEditorLanguage>(['html', 'xml']);

/**
 * Applies language-aware smart Enter and related edits.
 * Returns null to allow native textarea behavior.
 */
export function resolveTxCodeEditorSmartEdit(
  params: TxCodeEditorSmartEditParams,
): TxCodeEditorEditResult | null {
  const { key, value, selection, language } = params;
  if (selection.start !== selection.end) {
    return null;
  }
  const caret = selection.start;

  if (key === 'Enter') {
    return resolveSmartEnter(value, caret, language);
  }

  return null;
}

/** Caller should pass shiftKey via extended params when wiring Enter. */
export function resolveTxCodeEditorSmartEditWithModifiers(
  params: TxCodeEditorSmartEditParams & { readonly shiftKey?: boolean },
): TxCodeEditorEditResult | null {
  if (params.key === 'Enter' && params.shiftKey) {
    return null;
  }
  return resolveTxCodeEditorSmartEdit(params);
}

function resolveSmartEnter(
  value: string,
  caret: number,
  language: TxCodeEditorLanguage,
): TxCodeEditorEditResult | null {
  const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  const lineBeforeCaret = value.slice(lineStart, caret);

  if (language === 'plaintext') {
    const baseIndent = lineLeadingWhitespace(lineBeforeCaret);
    return replace(value, caret, caret, '\n' + baseIndent, 0);
  }

  if (language === 'json') {
    return applyJsonEnterPlan(value, caret, planJsonEnter(value, caret, lineBeforeCaret));
  }

  const baseIndent = lineLeadingWhitespace(lineBeforeCaret);

  if (MARKUP_LANGUAGES.has(language)) {
    return applyMarkupEnterEditResult(value, caret, planMarkupEnter(value, caret, lineBeforeCaret));
  }

  if (language === 'graphql') {
    const trimmed = lineBeforeCaret.trimStart();
    if (trimmed.startsWith('#')) {
      return replace(value, caret, caret, '\n' + baseIndent, 0);
    }
    const depth = braceDepthBeforeCaret(value, caret, '#');
    const extra = /[\{\[]\s*$/.test(lineBeforeCaret.trimEnd()) ? indentUnit() : '';
    return replace(value, caret, caret, '\n' + indentUnit().repeat(depth) + extra, 0);
  }

  if (SCRIPT_LANGUAGES.has(language)) {
    const depth = braceDepthBeforeCaret(value, caret, '//');
    const extra = /[\{\[]\s*$/.test(lineBeforeCaret.trimEnd()) ? indentUnit() : '';
    return replace(value, caret, caret, '\n' + indentUnit().repeat(depth) + extra, 0);
  }

  return replace(value, caret, caret, '\n' + baseIndent, 0);
}

function applyMarkupEnterEditResult(
  value: string,
  caret: number,
  plan: ReturnType<typeof planMarkupEnter>,
): TxCodeEditorEditResult {
  const result = applyMarkupEnterEdit(value, caret, plan);
  return {
    value: result.value,
    selectionStart: result.selectionStart,
    selectionEnd: result.selectionEnd,
  };
}

function applyJsonEnterPlan(
  value: string,
  caret: number,
  plan: ReturnType<typeof planJsonEnter>,
): TxCodeEditorEditResult | null {
  if (!plan) {
    return null;
  }
  switch (plan.type) {
    case 'plain':
      return replace(value, caret, caret, '\n' + plan.indent, 0);
    case 'line-break': {
      const result = applyJsonLineBreakWithCloser(value, caret, plan);
      return {
        value: result.value,
        selectionStart: result.selectionStart,
        selectionEnd: result.selectionEnd,
      };
    }
    case 'expand-block': {
      const tail = `\n${plan.closeIndent}${plan.close}`;
      const insert = `\n${plan.contentIndent}${tail}`;
      return replace(value, caret, caret, insert, tail.length);
    }
    default:
      return null;
  }
}

function lineLeadingWhitespace(line: string): string {
  const m = line.match(/^(\s*)/);
  return m?.[1] ?? '';
}

function indentUnit(): string {
  return ' '.repeat(TX_CODE_EDITOR_TAB_SIZE);
}

function braceDepthBeforeCaret(value: string, caret: number, lineCommentPrefix: string): number {
  let depth = 0;
  let i = 0;
  while (i < caret) {
    if (value.startsWith(lineCommentPrefix, i)) {
      const nl = value.indexOf('\n', i);
      i = nl === -1 ? caret : nl + 1;
      continue;
    }
    const ch = value[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '"' || ch === "'") {
      i = skipString(value, i, ch);
      continue;
    }
    i++;
  }
  return depth;
}

/**
 * After typing an opening `"` for a JSON value, offer a closing quote via the suggestion panel (not auto-insert).
 */
export function shouldOfferJsonClosingQuote(value: string, caret: number): boolean {
  if (caret < 1 || value[caret - 1] !== '"') {
    return false;
  }
  if (value[caret] === '"') {
    return false;
  }
  let i = caret - 2;
  while (i >= 0 && /\s/.test(value[i]!)) {
    i--;
  }
  if (i < 0) {
    return true;
  }
  const ch = value[i]!;
  return ch === ':' || ch === ',' || ch === '[' || ch === '{' || ch === '(';
}

function skipString(value: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return value.length;
}

function replace(
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

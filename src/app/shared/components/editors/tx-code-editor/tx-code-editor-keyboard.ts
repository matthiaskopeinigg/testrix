import type { TxCodeEditorUndoSnapshot } from './tx-code-editor-undo';

/** Two spaces per Tab (VS Code default for JSON/JS). */
export const TX_CODE_EDITOR_TAB_SIZE = 2;

export const TX_CODE_EDITOR_LINE_COMMENT_PREFIX = '// ';

export interface TxCodeEditorSelection {
  readonly start: number;
  readonly end: number;
}

export type TxCodeEditorShortcutAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'format'
  | 'indent'
  | 'outdent'
  | 'toggleComment'
  | 'deleteLine'
  | 'duplicateLine'
  | 'autocomplete';

/** True when Ctrl (Windows/Linux) or Cmd (macOS) is held. */
export function txCodeEditorIsModKey(ev: KeyboardEvent): boolean {
  return ev.ctrlKey || ev.metaKey;
}

/**
 * Maps a keydown event to an editor action (VS Code–aligned where practical).
 */
export function resolveTxCodeEditorShortcut(ev: KeyboardEvent): TxCodeEditorShortcutAction | null {
  const mod = txCodeEditorIsModKey(ev);
  const key = ev.key.toLowerCase();

  if (!mod) {
    if (ev.key === 'Tab' && !ev.altKey) {
      return ev.shiftKey ? 'outdent' : 'indent';
    }
    return null;
  }

  if (ev.altKey) {
    return null;
  }

  if (key === ' ' && !ev.shiftKey) {
    return 'autocomplete';
  }
  if (key === 'c' && !ev.shiftKey) {
    return 'copy';
  }
  if (key === 'x' && !ev.shiftKey) {
    return 'cut';
  }
  if (key === 'v' && !ev.shiftKey) {
    return 'paste';
  }
  if (key === 'a' && !ev.shiftKey) {
    return 'selectAll';
  }
  if (key === 'z' && ev.shiftKey) {
    return 'redo';
  }
  if (key === 'z' && !ev.shiftKey) {
    return 'undo';
  }
  if (key === 'y' && !ev.shiftKey) {
    return 'redo';
  }
  if (key === 'f' && ev.shiftKey) {
    return 'format';
  }
  if (key === '/' && !ev.shiftKey) {
    return 'toggleComment';
  }
  if (key === 'd' && !ev.shiftKey) {
    return 'duplicateLine';
  }
  if (key === 'k' && ev.shiftKey) {
    return 'deleteLine';
  }

  return null;
}

export function txCodeEditorGetSelection(textarea: HTMLTextAreaElement): TxCodeEditorSelection {
  return { start: textarea.selectionStart, end: textarea.selectionEnd };
}

export function txCodeEditorSnapshot(
  value: string,
  textarea: HTMLTextAreaElement,
): TxCodeEditorUndoSnapshot {
  const sel = txCodeEditorGetSelection(textarea);
  return { value, selectionStart: sel.start, selectionEnd: sel.end };
}

export function txCodeEditorSelectedText(value: string, sel: TxCodeEditorSelection): string {
  return value.slice(sel.start, sel.end);
}

export interface TxCodeEditorEditResult {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export function txCodeEditorReplaceRange(
  value: string,
  start: number,
  end: number,
  insert: string,
  caretOffsetFromEnd = 0,
): TxCodeEditorEditResult {
  const next = value.slice(0, start) + insert + value.slice(end);
  const caret = start + insert.length - caretOffsetFromEnd;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

/** Line range covering the selection (or caret line). */
export function txCodeEditorLineRange(
  value: string,
  sel: TxCodeEditorSelection,
): { lineStart: number; lineEnd: number } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
  let lineEnd = sel.end;
  if (sel.start === sel.end && lineEnd < value.length && value[lineEnd] !== '\n') {
    const nextNl = value.indexOf('\n', lineEnd);
    lineEnd = nextNl === -1 ? value.length : nextNl;
  } else {
    const after = value.indexOf('\n', sel.end);
    lineEnd = after === -1 ? value.length : after;
  }
  return { lineStart, lineEnd };
}

export function txCodeEditorIndentLines(
  value: string,
  sel: TxCodeEditorSelection,
  tabSize = TX_CODE_EDITOR_TAB_SIZE,
): TxCodeEditorEditResult {
  const pad = ' '.repeat(tabSize);
  const { lineStart, lineEnd } = txCodeEditorLineRange(value, sel);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const indented = lines.map((line) => pad + line).join('\n');
  const next = value.slice(0, lineStart) + indented + value.slice(lineEnd);
  const delta = pad.length * lines.length;
  return {
    value: next,
    selectionStart: sel.start + pad.length,
    selectionEnd: sel.end + delta,
  };
}

export function txCodeEditorOutdentLines(
  value: string,
  sel: TxCodeEditorSelection,
  tabSize = TX_CODE_EDITOR_TAB_SIZE,
): TxCodeEditorEditResult {
  const { lineStart, lineEnd } = txCodeEditorLineRange(value, sel);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  let pos = lineStart;
  let removedBefore = 0;
  const outdented: string[] = [];
  for (const line of lines) {
    let remove = 0;
    if (line.startsWith(' '.repeat(tabSize))) {
      remove = tabSize;
    } else if (line.startsWith('\t')) {
      remove = 1;
    } else if (line.startsWith(' ')) {
      remove = 1;
    }
    if (pos <= sel.start) {
      removedBefore += remove;
    }
    outdented.push(line.slice(remove));
    pos += line.length + 1;
  }
  const insert = outdented.join('\n');
  const next = value.slice(0, lineStart) + insert + value.slice(lineEnd);
  const delta = insert.length - block.length;
  return {
    value: next,
    selectionStart: Math.max(lineStart, sel.start - removedBefore),
    selectionEnd: Math.max(lineStart, sel.end + delta),
  };
}

export function txCodeEditorToggleLineComments(
  value: string,
  sel: TxCodeEditorSelection,
  prefix = TX_CODE_EDITOR_LINE_COMMENT_PREFIX,
): TxCodeEditorEditResult {
  const { lineStart, lineEnd } = txCodeEditorLineRange(value, sel);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const allCommented = lines.every((line) => line.trim() === '' || line.trimStart().startsWith('//'));
  const toggled = lines.map((line) => {
    if (line.trim() === '') {
      return line;
    }
    if (allCommented) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('// ')) {
        const leading = line.length - trimmed.length;
        return line.slice(0, leading) + trimmed.slice(3);
      }
      if (trimmed.startsWith('//')) {
        const leading = line.length - trimmed.length;
        return line.slice(0, leading) + trimmed.slice(2);
      }
      return line;
    }
    const leading = line.length - line.trimStart().length;
    return line.slice(0, leading) + prefix + line.trimStart();
  });
  const insert = toggled.join('\n');
  const next = value.slice(0, lineStart) + insert + value.slice(lineEnd);
  const delta = insert.length - block.length;
  return {
    value: next,
    selectionStart: sel.start,
    selectionEnd: sel.end + delta,
  };
}

/** Character range removed when deleting or cutting whole line(s) (VS Code–aligned). */
export function txCodeEditorLineRemovalRange(
  value: string,
  sel: TxCodeEditorSelection,
): { readonly removeStart: number; readonly removeEnd: number } {
  const { lineStart, lineEnd } = txCodeEditorLineRange(value, sel);
  let removeStart = lineStart;
  let removeEnd = lineEnd;
  if (removeEnd < value.length && value[removeEnd] === '\n') {
    removeEnd += 1;
  } else if (removeStart > 0 && value[removeStart - 1] === '\n') {
    removeStart -= 1;
  }
  return { removeStart, removeEnd };
}

export function txCodeEditorDeleteLines(value: string, sel: TxCodeEditorSelection): TxCodeEditorEditResult {
  const { removeStart, removeEnd } = txCodeEditorLineRemovalRange(value, sel);
  const next = value.slice(0, removeStart) + value.slice(removeEnd);
  return { value: next, selectionStart: removeStart, selectionEnd: removeStart };
}

/** Text placed on the clipboard when copying the current line with no selection. */
export function txCodeEditorCopyLineText(value: string, sel: TxCodeEditorSelection): string {
  const { removeStart, removeEnd } = txCodeEditorLineRemovalRange(value, sel);
  return value.slice(removeStart, removeEnd);
}

/** Cuts the current line when the caret has no selection (VS Code Ctrl/Cmd+X). */
export function txCodeEditorCutLines(
  value: string,
  sel: TxCodeEditorSelection,
): { readonly text: string; readonly edit: TxCodeEditorEditResult } {
  const { removeStart, removeEnd } = txCodeEditorLineRemovalRange(value, sel);
  const text = value.slice(removeStart, removeEnd);
  const next = value.slice(0, removeStart) + value.slice(removeEnd);
  return {
    text,
    edit: { value: next, selectionStart: removeStart, selectionEnd: removeStart },
  };
}

export function txCodeEditorDuplicateLines(value: string, sel: TxCodeEditorSelection): TxCodeEditorEditResult {
  const { lineStart, lineEnd } = txCodeEditorLineRange(value, sel);
  const block = value.slice(lineStart, lineEnd);
  const suffix = block.endsWith('\n') ? block : block + '\n';
  const insertAt = lineEnd;
  const next = value.slice(0, insertAt) + suffix + value.slice(insertAt);
  const caret = insertAt + suffix.length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

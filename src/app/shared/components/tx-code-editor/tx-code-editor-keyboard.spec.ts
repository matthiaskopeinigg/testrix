import { describe, expect, it } from 'vitest';

import {
  resolveTxCodeEditorShortcut,
  txCodeEditorCutLines,
  txCodeEditorIndentLines,
  txCodeEditorToggleLineComments,
} from './tx-code-editor-keyboard';

describe('resolveTxCodeEditorShortcut', () => {
  it('maps common VS Code bindings', () => {
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(
      'copy',
    );
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true }))).toBe(
      'cut',
    );
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }))).toBe(
      'paste',
    );
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(
      'undo',
    );
    expect(
      resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true })),
    ).toBe('redo');
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true }))).toBe(
      'format',
    );
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: '/', ctrlKey: true }))).toBe(
      'toggleComment',
    );
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'Tab' }))).toBe('indent');
    expect(resolveTxCodeEditorShortcut(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))).toBe(
      'outdent',
    );
  });
});

describe('txCodeEditorIndentLines', () => {
  it('indents the active line', () => {
    const result = txCodeEditorIndentLines('line', { start: 2, end: 2 });
    expect(result.value).toBe('  line');
  });
});

describe('txCodeEditorToggleLineComments', () => {
  it('prefixes lines with //', () => {
    const result = txCodeEditorToggleLineComments('a\nb', { start: 0, end: 3 });
    expect(result.value).toBe('// a\n// b');
  });
});

describe('txCodeEditorCutLines', () => {
  it('cuts the caret line when selection is empty', () => {
    const { text, edit } = txCodeEditorCutLines('first\nsecond\nthird', { start: 8, end: 8 });
    expect(text).toBe('second\n');
    expect(edit.value).toBe('first\nthird');
    expect(edit.selectionStart).toBe(6);
  });
});

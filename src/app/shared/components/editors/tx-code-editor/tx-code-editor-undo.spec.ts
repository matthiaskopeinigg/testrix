import { describe, expect, it } from 'vitest';

import { TxCodeEditorUndoStack } from './tx-code-editor-undo';

describe('TxCodeEditorUndoStack', () => {
  it('undoes and redoes snapshots', () => {
    const stack = new TxCodeEditorUndoStack();
    stack.record({ value: 'a', selectionStart: 0, selectionEnd: 0 });
    stack.record({ value: 'ab', selectionStart: 2, selectionEnd: 2 });
    const undone = stack.undo({ value: 'abc', selectionStart: 3, selectionEnd: 3 });
    expect(undone?.value).toBe('ab');
    const redone = stack.redo({ value: 'ab', selectionStart: 2, selectionEnd: 2 });
    expect(redone?.value).toBe('abc');
  });
});

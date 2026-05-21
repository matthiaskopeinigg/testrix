/** Snapshot for undo / redo (content + caret). */
export interface TxCodeEditorUndoSnapshot {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Bounded undo/redo stacks for the code editor (browser undo is unreliable with synced values).
 */
export class TxCodeEditorUndoStack {
  private readonly past: TxCodeEditorUndoSnapshot[] = [];
  private readonly future: TxCodeEditorUndoSnapshot[] = [];

  constructor(private readonly maxDepth = 80) {}

  /** Pushes the current state before a user edit. */
  record(snapshot: TxCodeEditorUndoSnapshot): void {
    const last = this.past[this.past.length - 1];
    if (
      last &&
      last.value === snapshot.value &&
      last.selectionStart === snapshot.selectionStart &&
      last.selectionEnd === snapshot.selectionEnd
    ) {
      return;
    }
    this.past.push(snapshot);
    if (this.past.length > this.maxDepth) {
      this.past.shift();
    }
    this.future.length = 0;
  }

  undo(current: TxCodeEditorUndoSnapshot): TxCodeEditorUndoSnapshot | null {
    if (this.past.length === 0) {
      return null;
    }
    this.future.push(current);
    return this.past.pop() ?? null;
  }

  redo(current: TxCodeEditorUndoSnapshot): TxCodeEditorUndoSnapshot | null {
    if (this.future.length === 0) {
      return null;
    }
    this.past.push(current);
    return this.future.pop() ?? null;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}

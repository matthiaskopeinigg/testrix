import { describe, expect, it } from 'vitest';

import {
  filterTxCodeEditorCompletions,
  txCodeEditorCompletionContext,
  txCodeEditorInlineGhostSuffix,
} from './tx-code-editor-completion.logic';

describe('txCodeEditorCompletionContext', () => {
  it('captures dotted pm prefix before caret', () => {
    const value = 'const x = pm.variables.';
    const ctx = txCodeEditorCompletionContext(value, value.length);
    expect(ctx.needle).toBe('pm.variables.');
    expect(ctx.replaceStart).toBe(10);
    expect(ctx.replaceEnd).toBe(value.length);
  });
});

describe('filterTxCodeEditorCompletions', () => {
  it('filters by label substring', () => {
    const items = [
      { label: 'pm.variables.get', insert: "pm.variables.get('')" },
      { label: 'pm.environment.get', insert: "pm.environment.get('')" },
    ];
    const filtered = filterTxCodeEditorCompletions(items, 'variables');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe('pm.variables.get');
  });

  it('returns all items when needle is empty', () => {
    const items = [
      { label: 'a', insert: 'a' },
      { label: 'b', insert: 'b' },
    ];
    expect(filterTxCodeEditorCompletions(items, '')).toHaveLength(2);
  });

  it('matches insert text anywhere in the snippet', () => {
    const items = [{ label: 'async function', insert: 'async function () {}' }];
    expect(filterTxCodeEditorCompletions(items, 'func')).toHaveLength(1);
  });

  it('ranks prefix matches ahead of substring matches', () => {
    const items = [
      { label: 'email', insert: 'email' },
      { label: 'id', insert: 'id' },
      { label: 'user_id', insert: 'user_id' },
    ];
    expect(filterTxCodeEditorCompletions(items, 'id').map((item) => item.label)).toEqual([
      'id',
      'user_id',
    ]);
  });
});

describe('txCodeEditorInlineGhostSuffix', () => {
  it('returns the untyped remainder of a completion', () => {
    expect(txCodeEditorInlineGhostSuffix('us', 'users')).toBe('ers');
    expect(txCodeEditorInlineGhostSuffix('users.', 'users.id')).toBe('id');
    expect(txCodeEditorInlineGhostSuffix('app.o', 'app.orders')).toBe('rders');
  });
});

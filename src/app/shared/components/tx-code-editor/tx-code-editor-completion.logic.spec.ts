import { describe, expect, it } from 'vitest';

import {
  filterTxCodeEditorCompletions,
  txCodeEditorCompletionContext,
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
});

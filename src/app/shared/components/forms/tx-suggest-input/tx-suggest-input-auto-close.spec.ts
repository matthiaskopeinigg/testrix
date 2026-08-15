import { describe, expect, it } from 'vitest';

import {
  resolveSuggestInputAutoClose,
  resolveSuggestInputAutoCloseBackspace,
} from './tx-suggest-input-auto-close';

describe('resolveSuggestInputAutoClose', () => {
  it("inserts a paired single quote and leaves the caret between them", () => {
    expect(resolveSuggestInputAutoClose("'", 'email LIKE ', 11, 11)).toEqual({
      value: "email LIKE ''",
      caret: 12,
    });
  });

  it('skips an existing closer', () => {
    expect(resolveSuggestInputAutoClose("'", "email LIKE ''", 12, 12)).toEqual({
      value: "email LIKE ''",
      caret: 13,
    });
  });

  it('wraps a selection', () => {
    expect(resolveSuggestInputAutoClose("'", 'foo', 0, 3)).toEqual({
      value: "'foo'",
      caret: 4,
    });
  });

  it('inserts a paired double quote and leaves the caret between them', () => {
    expect(resolveSuggestInputAutoClose('"', 'name = ', 7, 7)).toEqual({
      value: 'name = ""',
      caret: 8,
    });
  });
});

describe('resolveSuggestInputAutoCloseBackspace', () => {
  it('deletes an empty quote pair', () => {
    expect(resolveSuggestInputAutoCloseBackspace("''", 1)).toEqual({
      value: '',
      caret: 0,
    });
  });
});

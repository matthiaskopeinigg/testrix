import { describe, expect, it } from 'vitest';

import { isSuggestTriggerKeydown } from './tx-suggest-input-keyboard';

function keydown(partial: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return partial as KeyboardEvent;
}

describe('isSuggestTriggerKeydown', () => {
  it('matches Ctrl+Space and Cmd+Space', () => {
    expect(isSuggestTriggerKeydown(keydown({ key: ' ', ctrlKey: true }))).toBe(true);
    expect(isSuggestTriggerKeydown(keydown({ key: ' ', metaKey: true }))).toBe(true);
  });

  it('ignores plain Space and modified Space with shift', () => {
    expect(isSuggestTriggerKeydown(keydown({ key: ' ' }))).toBe(false);
    expect(isSuggestTriggerKeydown(keydown({ key: ' ', ctrlKey: true, shiftKey: true }))).toBe(false);
  });
});

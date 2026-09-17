import { describe, expect, it } from 'vitest';

import { formatShortcut, matchesShortcut, type ShortcutEvent } from './shortcut-match';

function chordEvent(
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {},
): ShortcutEvent {
  return {
    key,
    ctrlKey: Boolean(mods.ctrl),
    metaKey: Boolean(mods.meta),
    altKey: Boolean(mods.alt),
    shiftKey: Boolean(mods.shift),
  };
}

describe('matchesShortcut', () => {
  it('matches Ctrl K', () => {
    expect(matchesShortcut('Ctrl K', chordEvent('k', { ctrl: true }))).toBe(true);
    expect(matchesShortcut('Ctrl K', chordEvent('k'))).toBe(false);
  });

  it('matches Ctrl comma', () => {
    expect(matchesShortcut('Ctrl ,', chordEvent(',', { ctrl: true }))).toBe(true);
  });
});

describe('formatShortcut', () => {
  it('formats Ctrl K', () => {
    expect(formatShortcut(chordEvent('k', { ctrl: true }))).toBe('Ctrl K');
  });

  it('formats Ctrl comma', () => {
    expect(formatShortcut(chordEvent(',', { ctrl: true }))).toBe('Ctrl ,');
  });

  it('ignores modifier-only and unmodified letters', () => {
    expect(formatShortcut(chordEvent('Control', { ctrl: true }))).toBeNull();
    expect(formatShortcut(chordEvent('k'))).toBeNull();
  });
});

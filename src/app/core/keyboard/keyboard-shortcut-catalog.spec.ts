import { describe, expect, it } from 'vitest';

import { KEYBOARD_SHORTCUT_CATALOG, formatChordForDisplay } from './keyboard-shortcut-catalog';

describe('keyboard-shortcut-catalog', () => {
  it('defines close and split workspace chords', () => {
    const byId = Object.fromEntries(KEYBOARD_SHORTCUT_CATALOG.map((entry) => [entry.id, entry]));
    expect(byId['global.closeTab']?.defaultChord).toBe('Mod+KeyX');
    expect(byId['global.splitTabRight']?.defaultChord).toBe('Mod+ArrowRight');
    expect(byId['global.splitTabLeft']?.defaultChord).toBe('Mod+ArrowLeft');
    expect(byId['global.splitTabUp']?.defaultChord).toBe('Mod+ArrowUp');
    expect(byId['global.splitTabDown']?.defaultChord).toBe('Mod+ArrowDown');
  });

  it('formats chords for display', () => {
    expect(formatChordForDisplay('Mod+KeyX', 'win32')).toBe('Ctrl+X');
    expect(formatChordForDisplay('Mod+ArrowRight', 'win32')).toBe('Ctrl+Right');
    expect(formatChordForDisplay('Mod+ArrowLeft', 'MacIntel')).toBe('⌘Left');
  });
});

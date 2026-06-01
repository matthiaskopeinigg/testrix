import { describe, expect, it } from 'vitest';

import {
  keyboardEventMatchesChord,
  parseChord,
  serializeChordFromEvent,
  validateBindingMap,
} from './chord-matcher';
import { KEYBOARD_SHORTCUT_IDS } from './keyboard-shortcut-catalog';

function ev(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'code'>): KeyboardEvent {
  return partial as KeyboardEvent;
}

describe('chord-matcher', () => {
  describe('parseChord', () => {
    it('parses Mod+KeyK', () => {
      const parsed = parseChord('Mod+KeyK');
      expect(parsed).toEqual(
        expect.objectContaining({
          mod: true,
          ctrl: false,
          meta: false,
          alt: false,
          shift: false,
          code: 'KeyK',
        }),
      );
    });

    it('parses Ctrl+Alt+Digit1', () => {
      const parsed = parseChord('Ctrl+Alt+Digit1');
      expect(parsed).toEqual(
        expect.objectContaining({
          mod: false,
          ctrl: true,
          meta: false,
          alt: true,
          shift: false,
          code: 'Digit1',
        }),
      );
    });

    it('normalizes slash token', () => {
      expect(parseChord('Mod+/')?.code).toBe('Slash');
    });

    it('returns null for invalid chord', () => {
      expect(parseChord('')).toBeNull();
      expect(parseChord('Mod+')).toBeNull();
    });
  });

  describe('keyboardEventMatchesChord', () => {
    it('treats Mod as ctrl or meta', () => {
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'KeyK', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
          'Mod+KeyK',
        ),
      ).toBe(true);
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'KeyK', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }),
          'Mod+KeyK',
        ),
      ).toBe(true);
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'KeyK', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }),
          'Mod+KeyK',
        ),
      ).toBe(false);
    });

    it('rejects extra modifier when chord has no Mod/Ctrl/Meta', () => {
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'KeyF', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
          'KeyF',
        ),
      ).toBe(false);
    });

    it('matches shift when required', () => {
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'KeyD', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }),
          'Mod+Shift+KeyD',
        ),
      ).toBe(true);
    });

    it('matches Alt+ArrowUp', () => {
      expect(
        keyboardEventMatchesChord(
          ev({ code: 'ArrowUp', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false }),
          'Alt+ArrowUp',
        ),
      ).toBe(true);
    });
  });

  describe('serializeChordFromEvent', () => {
    it('orders Alt, Shift, Mod then code', () => {
      const serialized = serializeChordFromEvent(
        ev({ code: 'Slash', altKey: true, shiftKey: true, ctrlKey: true, metaKey: false }),
      );
      expect(serialized).toBe('Alt+Shift+Mod+Slash');
    });
  });

  describe('validateBindingMap', () => {
    it('accepts non-overlapping bindings', () => {
      const result = validateBindingMap(
        { 'global.commandPaletteToggle': 'Mod+KeyK', 'global.closeTab': 'Mod+KeyD' },
        KEYBOARD_SHORTCUT_IDS,
      );
      expect(result).toEqual({ ok: true });
    });

    it('rejects duplicate chord for two actions', () => {
      const result = validateBindingMap(
        { 'global.commandPaletteToggle': 'Mod+KeyK', 'global.closeTab': 'Mod+KeyK' },
        KEYBOARD_SHORTCUT_IDS,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('both');
      }
    });

    it('rejects invalid chord string', () => {
      const result = validateBindingMap({ 'global.commandPaletteToggle': 'Mod+' }, KEYBOARD_SHORTCUT_IDS);
      expect(result.ok).toBe(false);
    });
  });
});

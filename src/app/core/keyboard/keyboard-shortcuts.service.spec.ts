import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ConfigService } from '../config/config.service';

import { KEYBOARD_SHORTCUT_CATALOG } from './keyboard-shortcut-catalog';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;
  let configSpy: { settings: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configSpy = {
      settings: vi.fn().mockReturnValue({ keyboard: { bindings: {} } }),
    };

    TestBed.configureTestingModule({
      providers: [
        KeyboardShortcutsService,
        { provide: ConfigService, useValue: configSpy },
      ],
    });
    service = TestBed.inject(KeyboardShortcutsService);
  });

  describe('getCatalog', () => {
    it('returns the full keyboard shortcut catalog', () => {
      const catalog = service.getCatalog();
      expect(catalog).toBe(KEYBOARD_SHORTCUT_CATALOG);
      expect(catalog.length).toBeGreaterThan(0);
    });
  });

  describe('effectiveChord', () => {
    it('returns the default chord when no user override exists', () => {
      const firstGlobal = KEYBOARD_SHORTCUT_CATALOG.find((entry) => entry.scope === 'global');
      if (!firstGlobal) return;

      expect(service.effectiveChord(firstGlobal.id)).toBe(firstGlobal.defaultChord);
    });

    it('returns user override when set in settings', () => {
      const firstGlobal = KEYBOARD_SHORTCUT_CATALOG.find((entry) => entry.scope === 'global');
      if (!firstGlobal) return;

      configSpy.settings.mockReturnValue({
        keyboard: { bindings: { [firstGlobal.id]: 'Ctrl+Alt+KeyZ' } },
      });

      expect(service.effectiveChord(firstGlobal.id)).toBe('Ctrl+Alt+KeyZ');
    });

    it('returns empty string for unknown action id', () => {
      expect(service.effectiveChord('nonexistent.action')).toBe('');
    });

    it('falls back to default when user binding is empty', () => {
      const firstGlobal = KEYBOARD_SHORTCUT_CATALOG.find((entry) => entry.scope === 'global');
      if (!firstGlobal) return;

      configSpy.settings.mockReturnValue({
        keyboard: { bindings: { [firstGlobal.id]: '  ' } },
      });

      expect(service.effectiveChord(firstGlobal.id)).toBe(firstGlobal.defaultChord);
    });
  });

  describe('register', () => {
    it('returns an unregister function', () => {
      const handler = vi.fn();
      const unregister = service.register('test.action', handler);
      expect(typeof unregister).toBe('function');
    });

    it('unregister removes the specific handler', () => {
      const handler = vi.fn();
      const unregister = service.register('test.action', handler);
      unregister();
      unregister();
    });
  });
});

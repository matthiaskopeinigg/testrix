import { describe, expect, it } from 'vitest';

import {
  createDefaultEditorSettings,
  editorSettingsSchema,
  formatCodeEditorShortcutKeys,
} from './editor-settings.schema';

describe('editorSettingsSchema', () => {
  it('parses defaults', () => {
    const editor = createDefaultEditorSettings();
    expect(editorSettingsSchema.parse(editor).keyboard.shortcutsEnabled).toBe(true);
  });
});

describe('formatCodeEditorShortcutKeys', () => {
  it('uses Cmd on macOS', () => {
    expect(formatCodeEditorShortcutKeys('{mod}+C', 'darwin')).toBe('⌘+C');
  });

  it('uses Ctrl elsewhere', () => {
    expect(formatCodeEditorShortcutKeys('{mod}+C', 'win32')).toBe('Ctrl+C');
  });
});

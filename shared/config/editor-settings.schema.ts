import { z } from 'zod';

export const editorKeyboardSettingsSchema = z.object({
  /** Master switch for VS Code–style editor shortcuts (copy, undo, Tab indent, …). */
  shortcutsEnabled: z.boolean(),
  /** Ctrl/Cmd+Space and related completion UI. */
  autocompleteEnabled: z.boolean(),
  /** Postman-style `pm.*` suggestions in JavaScript editors. */
  jsAutocompleteEnabled: z.boolean(),
  /** Open suggestions after `.` on `pm.*` tokens (in addition to Ctrl/Cmd+Space). */
  autocompleteOnDot: z.boolean(),
  /** JSON snippet catalog on Ctrl/Cmd+Space in JSON editors. */
  jsonSnippetAutocomplete: z.boolean(),
  /** Auto-close quotes, brackets, and markup tags while typing. */
  autoCloseEnabled: z.boolean(),
  /** Smart Enter (indent) and related typing assists. */
  smartEditingEnabled: z.boolean(),
  /** XML/HTML structural snippets on Ctrl/Cmd+Space. */
  markupSnippetAutocomplete: z.boolean(),
  /** `$` and `{{environment}}` suggestions while typing and on Ctrl/Cmd+Space. */
  templateVariableAutocomplete: z.boolean(),
  /** Optional closing `"` in the JSON suggestion panel after an opening quote (Tab to accept). */
  jsonClosingQuoteSuggest: z.boolean(),
});

export type EditorKeyboardSettings = z.infer<typeof editorKeyboardSettingsSchema>;

export const editorSettingsSchema = z.object({
  keyboard: editorKeyboardSettingsSchema,
});

export type EditorSettings = z.infer<typeof editorSettingsSchema>;

export function createDefaultEditorKeyboardSettings(): EditorKeyboardSettings {
  return {
    shortcutsEnabled: true,
    autocompleteEnabled: true,
    jsAutocompleteEnabled: true,
    autocompleteOnDot: true,
    jsonSnippetAutocomplete: true,
    autoCloseEnabled: true,
    smartEditingEnabled: false,
    markupSnippetAutocomplete: true,
    templateVariableAutocomplete: true,
    jsonClosingQuoteSuggest: true,
  };
}

export function createDefaultEditorSettings(): EditorSettings {
  return {
    keyboard: createDefaultEditorKeyboardSettings(),
  };
}

export type CodeEditorShortcutCategory = 'clipboard' | 'editing' | 'navigation' | 'code';

export interface CodeEditorShortcutReference {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Use `{mod}` for Ctrl (Windows/Linux) or ⌘ (macOS). */
  readonly keys: string;
  readonly category: CodeEditorShortcutCategory;
}

/** Read-only shortcut list shown in Settings → Keyboard (and documentation). */
export const CODE_EDITOR_SHORTCUT_REFERENCE: readonly CodeEditorShortcutReference[] = [
  { id: 'copy', label: 'Copy', keys: '{mod}+C', category: 'clipboard' },
  {
    id: 'cut',
    label: 'Cut',
    description: 'Cuts the selection, or the current line when nothing is selected.',
    keys: '{mod}+X',
    category: 'clipboard',
  },
  { id: 'paste', label: 'Paste', keys: '{mod}+V', category: 'clipboard' },
  { id: 'selectAll', label: 'Select all', keys: '{mod}+A', category: 'clipboard' },
  { id: 'undo', label: 'Undo', keys: '{mod}+Z', category: 'editing' },
  { id: 'redo', label: 'Redo', keys: '{mod}+Shift+Z', category: 'editing' },
  { id: 'redoAlt', label: 'Redo (alternate)', keys: '{mod}+Y', category: 'editing' },
  { id: 'format', label: 'Format document', keys: '{mod}+Shift+F', category: 'code' },
  { id: 'autocomplete', label: 'Suggestions', keys: '{mod}+Space', category: 'code' },
  { id: 'comment', label: 'Toggle line comment', keys: '{mod}+/', category: 'code' },
  { id: 'indent', label: 'Indent line', keys: 'Tab', category: 'editing' },
  { id: 'outdent', label: 'Outdent line', keys: 'Shift+Tab', category: 'editing' },
  { id: 'deleteLine', label: 'Delete line', keys: '{mod}+Shift+K', category: 'editing' },
  { id: 'duplicateLine', label: 'Duplicate line', keys: '{mod}+D', category: 'editing' },
];

export const CODE_EDITOR_SHORTCUT_CATEGORY_LABELS: Readonly<Record<CodeEditorShortcutCategory, string>> = {
  clipboard: 'Clipboard',
  editing: 'Editing',
  navigation: 'Navigation',
  code: 'Code',
};

/** Replaces `{mod}` with platform-appropriate modifier label. */
export function formatCodeEditorShortcutKeys(keys: string, platform: string): string {
  const mod = platform === 'darwin' ? '⌘' : 'Ctrl';
  return keys.replace(/\{mod\}/g, mod);
}

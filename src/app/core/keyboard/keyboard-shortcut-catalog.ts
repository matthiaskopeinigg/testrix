/**
 * Single source of truth for keyboard shortcut metadata (defaults + scope).
 * User overrides live in Settings.keyboard.bindings (action id → chord string).
 */
export type KeyboardShortcutScope = 'global' | 'editor';

export interface KeyboardShortcutDefinition {
  id: string;
  label: string;
  category: string;
  /** Default chord using event.code tokens, e.g. Mod+KeyK, Mod+Slash, Ctrl+Alt+Digit1 */
  defaultChord: string;
  scope: KeyboardShortcutScope;
  /**
   * When true, do not run this global shortcut if focus is in an input/textarea/select/contenteditable.
   */
  skipWhenInEditableField?: boolean;
}

export const KEYBOARD_SHORTCUT_CATALOG: readonly KeyboardShortcutDefinition[] = [
  {
    id: 'global.commandPaletteToggle',
    label: 'Toggle command palette',
    category: 'Global',
    defaultChord: 'Mod+KeyK',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.settingsOpen',
    label: 'Open settings',
    category: 'Global',
    defaultChord: 'Mod+Comma',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.teamsPanelToggle',
    label: 'Toggle teams panel',
    category: 'Global',
    defaultChord: 'Mod+Shift+KeyT',
    scope: 'global',
  },
  {
    id: 'global.closeTab',
    label: 'Close active tab',
    category: 'Workspace',
    defaultChord: 'Mod+KeyX',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.splitTabRight',
    label: 'Split tab to the right',
    category: 'Workspace',
    defaultChord: 'Mod+ArrowRight',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.splitTabLeft',
    label: 'Split tab to the left',
    category: 'Workspace',
    defaultChord: 'Mod+ArrowLeft',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.splitTabUp',
    label: 'Split tab up',
    category: 'Workspace',
    defaultChord: 'Mod+ArrowUp',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.splitTabDown',
    label: 'Split tab down',
    category: 'Workspace',
    defaultChord: 'Mod+ArrowDown',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.cycleTabForward',
    label: 'Next tab in pane',
    category: 'Workspace',
    defaultChord: 'Mod+Tab',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'global.cycleTabBackward',
    label: 'Previous tab in pane',
    category: 'Workspace',
    defaultChord: 'Mod+Shift+Tab',
    scope: 'global',
    skipWhenInEditableField: true,
  },
  {
    id: 'database.runQuery',
    label: 'Run database query',
    category: 'Database',
    defaultChord: 'Mod+Enter',
    scope: 'global',
  },
] as const;

export const KEYBOARD_SHORTCUT_IDS: readonly string[] = KEYBOARD_SHORTCUT_CATALOG.map((d) => d.id);

/** Human-readable chord for settings UI and help (Mod → Ctrl / ⌘). */
export function formatChordForDisplay(chord: string, platform?: string): string {
  const isMac = platform
    ? platform.toLowerCase().includes('mac')
    : typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);

  const pretty = chord
    .replace(/ArrowRight/g, 'Right')
    .replace(/ArrowLeft/g, 'Left')
    .replace(/ArrowUp/g, 'Up')
    .replace(/ArrowDown/g, 'Down')
    .replace(/Key([A-Z])/g, '$1')
    .replace(/Comma/g, ',');

  if (isMac) {
    return pretty.replace(/Mod\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧');
  }

  return pretty.replace(/Mod\+/g, 'Ctrl+');
}

import { z } from 'zod';

/** Built-in chord ids the shell and settings Keyboard page share. */
export const shortcutIdSchema = z.enum(['palette', 'settings', 'sidebar']);

export type ShortcutId = z.infer<typeof shortcutIdSchema>;

export const shortcutsSchema = z.object({
  palette: z.string().min(1),
  settings: z.string().min(1),
  sidebar: z.string().min(1),
});

export type Shortcuts = z.infer<typeof shortcutsSchema>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  palette: 'Ctrl K',
  settings: 'Ctrl ,',
  sidebar: 'Ctrl B',
};

export const SHORTCUT_CATALOG: readonly {
  readonly id: ShortcutId;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'palette', label: 'Command palette', hint: 'Search commands anywhere' },
  { id: 'settings', label: 'Open settings', hint: 'Preferences window' },
  { id: 'sidebar', label: 'Toggle sidebar', hint: 'Show or hide the tree' },
];

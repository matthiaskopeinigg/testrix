import { z } from 'zod';

/** Built-in chord ids the shell and settings Keyboard page share. */
export const shortcutIdSchema = z.enum([
  'palette',
  'settings',
  'sidebar',
  'help',
  'newRequest',
  'zoomIn',
  'zoomOut',
  'zoomReset',
]);

export type ShortcutId = z.infer<typeof shortcutIdSchema>;

export const shortcutsSchema = z.object({
  palette: z.string().min(1),
  settings: z.string().min(1),
  sidebar: z.string().min(1),
  help: z.string().min(1),
  newRequest: z.string().min(1),
  zoomIn: z.string().min(1),
  zoomOut: z.string().min(1),
  zoomReset: z.string().min(1),
});

export type Shortcuts = z.infer<typeof shortcutsSchema>;

export const DEFAULT_SHORTCUTS: Shortcuts = {
  palette: 'Ctrl K',
  settings: 'Ctrl ,',
  sidebar: 'Ctrl B',
  help: 'F1',
  newRequest: 'Ctrl N',
  zoomIn: 'Ctrl =',
  zoomOut: 'Ctrl -',
  zoomReset: 'Ctrl 0',
};

export const SHORTCUT_CATALOG: readonly {
  readonly id: ShortcutId;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'palette', label: 'Command palette', hint: 'Search commands anywhere' },
  { id: 'settings', label: 'Open settings', hint: 'Preferences window' },
  { id: 'sidebar', label: 'Toggle sidebar', hint: 'Show or hide the tree' },
  { id: 'help', label: 'Help', hint: 'Open contextual help' },
  { id: 'newRequest', label: 'New request', hint: 'Create an HTTP request in Collections' },
  { id: 'zoomIn', label: 'Zoom in', hint: 'Scale the whole shell up' },
  { id: 'zoomOut', label: 'Zoom out', hint: 'Scale the whole shell down' },
  { id: 'zoomReset', label: 'Reset zoom', hint: 'Restore 100% UI scale' },
];

export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'Hyper', 'Super']);

/**
 * Matches a stored chord such as `Ctrl K`, `Ctrl Shift C`, or `F1` against a keyboard event.
 */
export function matchesShortcut(chord: string, event: ShortcutEvent): boolean {
  const parts = chord
    .split(/[\s+]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }
  const rawKey = parts[parts.length - 1] ?? '';
  const key = rawKey === '+' ? '=' : rawKey.toLowerCase();
  const mods = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
  const wantCtrl = mods.has('ctrl') || mods.has('control') || mods.has('cmd') || mods.has('meta');
  const wantAlt = mods.has('alt');
  const wantShift = mods.has('shift');
  const hasCtrl = event.ctrlKey || event.metaKey;
  if (wantCtrl !== hasCtrl || wantAlt !== event.altKey) {
    return false;
  }
  if (wantShift !== event.shiftKey) {
    return false;
  }
  const eventKey = event.key === '+' ? '=' : event.key.toLowerCase();
  return eventKey === key;
}

/**
 * Turns a keydown into a stored chord such as `Ctrl K` or `F1`.
 * Modifier-only presses and unmodified letters return null.
 */
export function formatShortcut(event: ShortcutEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }
  const isFunctionKey = /^F\d{1,2}$/i.test(event.key);
  if (!(event.ctrlKey || event.metaKey || event.altKey) && !isFunctionKey) {
    return null;
  }
  const key = normalizeShortcutKey(event.key);
  if (!key) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey)
    parts.push('Ctrl');
  if (event.altKey)
    parts.push('Alt');
  if (event.shiftKey)
    parts.push('Shift');
  parts.push(key);
  return parts.join(' ');
}

function normalizeShortcutKey(key: string): string {
  if (key === ' ')
    return 'Space';
  if (key === '=' || key === '+')
    return '=';
  if (key.length === 1)
    return key.toUpperCase();
  return key;
}

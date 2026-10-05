import type { SaveMode, UserSettings } from '@testrix/contracts';

/**
 * Returns true when editors should keep a local draft until Save / Ctrl+S.
 */
export function isManualSaveMode(settings: Pick<UserSettings, 'saveMode'> | null | undefined): boolean {
  return settings?.saveMode === 'manual';
}

/**
 * True when Ctrl/Cmd+S should flush a dirty draft (manual mode only).
 */
export function shouldHandleManualSaveHotkey(options: {
  readonly settings: Pick<UserSettings, 'saveMode'> | null | undefined;
  readonly dirty: boolean;
}): boolean {
  return isManualSaveMode(options.settings) && options.dirty;
}

export type { SaveMode };

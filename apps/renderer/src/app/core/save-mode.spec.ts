import { describe, expect, it } from 'vitest';

import { isManualSaveMode, shouldHandleManualSaveHotkey } from './save-mode';

describe('save-mode', () => {
  it('treats only manual as draft mode', () => {
    expect(isManualSaveMode({ saveMode: 'auto' })).toBe(false);
    expect(isManualSaveMode({ saveMode: 'manual' })).toBe(true);
    expect(isManualSaveMode(null)).toBe(false);
  });

  it('gates Ctrl+S to dirty manual drafts', () => {
    expect(shouldHandleManualSaveHotkey({ settings: { saveMode: 'manual' }, dirty: true })).toBe(true);
    expect(shouldHandleManualSaveHotkey({ settings: { saveMode: 'manual' }, dirty: false })).toBe(false);
    expect(shouldHandleManualSaveHotkey({ settings: { saveMode: 'auto' }, dirty: true })).toBe(false);
  });
});

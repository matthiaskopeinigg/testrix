// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureWindowChrome,
  lockOverlayWindowDrag,
  resetOverlayWindowDrag,
  unlockOverlayWindowDrag,
} from './overlay-window-drag';

describe('overlay window drag', () => {
  afterEach(() => {
    resetOverlayWindowDrag();
  });

  it('locks only the titlebar drag strip while an overlay is open', () => {
    lockOverlayWindowDrag();
    expect(document.documentElement.classList.contains('tx-overlay-open')).toBe(true);
    expect(document.getElementById('tx-overlay-no-drag')?.textContent ?? '').toContain('.tx-titlebar__drag');
    expect(document.getElementById('tx-overlay-no-drag')?.textContent ?? '').not.toContain('html.tx-overlay-open *');
    unlockOverlayWindowDrag();
    expect(document.documentElement.classList.contains('tx-overlay-open')).toBe(false);
  });

  it('re-enables native window movement when chrome is recovered', () => {
    const setMovable = vi.fn();
    window.testrix = {
      window: { setMovable },
    } as unknown as Window['testrix'];
    lockOverlayWindowDrag();
    ensureWindowChrome();
    expect(document.documentElement.classList.contains('tx-overlay-open')).toBe(false);
    expect(setMovable).toHaveBeenCalledWith(true);
    delete window.testrix;
  });
});

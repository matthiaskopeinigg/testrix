import { describe, expect, it } from 'vitest';

import { isGuestNavigationRaceError } from './e2e-guest-script-errors';

describe('isGuestNavigationRaceError', () => {
  it('matches Electron navigation races', () => {
    expect(
      isGuestNavigationRaceError(
        'Script failed to execute, this normally means that a navigation happened.',
      ),
    ).toBe(true);
    expect(isGuestNavigationRaceError('Execution context was destroyed')).toBe(true);
    expect(isGuestNavigationRaceError('Render frame was disposed')).toBe(true);
    expect(isGuestNavigationRaceError('Frame was detached')).toBe(true);
  });

  it('does not match real selector or assertion failures', () => {
    expect(isGuestNavigationRaceError('Element not found: #login')).toBe(false);
    expect(isGuestNavigationRaceError('Assertion failed: URL did not match')).toBe(false);
    expect(isGuestNavigationRaceError('')).toBe(false);
    expect(isGuestNavigationRaceError(undefined)).toBe(false);
  });
});

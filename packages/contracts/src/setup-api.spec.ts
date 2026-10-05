import { describe, expect, it } from 'vitest';

import { setupSurfaceTitle } from './setup-api';

describe('setupSurfaceTitle', () => {
  it('names install, update, and uninstall windows', () => {
    expect(setupSurfaceTitle('install')).toBe('Testrix Setup');
    expect(setupSurfaceTitle('update')).toBe('Testrix Update');
    expect(setupSurfaceTitle('uninstall')).toBe('Testrix Uninstall');
  });
});

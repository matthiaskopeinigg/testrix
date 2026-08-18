import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

import { resolveDevChromiumLayout } from './dev-chromium-layout';

describe('resolveDevChromiumLayout', () => {
  it('keeps Chromium session data under userData instead of a per-pid temp folder', () => {
    const layout = resolveDevChromiumLayout({
      tmpdir: path.join(path.sep, 'tmp'),
      userData: path.join(path.sep, 'home', 'dev', '.config', 'testrix'),
      pid: 4242,
    });

    expect(layout.sessionDataDir).toBe(
      path.join(path.sep, 'home', 'dev', '.config', 'testrix', 'dev-session'),
    );
    expect(layout.diskCacheDir).toContain(path.join('testrix-dev-chromium', '4242'));
    expect(layout.sessionDataDir.includes('4242')).toBe(false);
  });
});

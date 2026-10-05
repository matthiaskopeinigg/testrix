import { describe, expect, it } from 'vitest';

import { resolveExtraResource } from './paths';

describe('resolveExtraResource', () => {
  it('uses the fallback when the packaged extra file is not next to Electron', () => {
    expect(resolveExtraResource('missing-packaged/index.html', 'fallback.html')).toBe(
      'fallback.html',
    );
  });
});

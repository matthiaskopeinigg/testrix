import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { bundledPath, resolveExtraResource } from '@testrix/electron-core';

describe('packaged renderer html', () => {
  it('falls back to the Angular dist next to the desktop app', () => {
    const fallback = bundledPath('../../renderer/dist/renderer/browser/index.html');
    expect(resolveExtraResource('browser/index.html', fallback)).toBe(fallback);
    expect(existsSync(fallback) || fallback.endsWith('index.html')).toBe(true);
  });
});

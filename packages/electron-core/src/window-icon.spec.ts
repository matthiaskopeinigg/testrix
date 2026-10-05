import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyWindowIcon, resolveWindowIcon, windowIconOption } from './window-icon';

describe('resolveWindowIcon', () => {
  it('finds the committed brand icon from the repo root', () => {
    const icon = resolveWindowIcon();
    expect(icon).toBeTruthy();
    expect(existsSync(icon!)).toBe(true);
    expect(path.basename(icon!)).toMatch(/^icon\.(ico|png)$/);
  });

  it('exposes the icon on BrowserWindow options', () => {
    const option = windowIconOption();
    expect(option.icon).toBe(resolveWindowIcon());
  });

  it('applies the brand icon after the window exists', () => {
    const applied: string[] = [];
    applyWindowIcon({ setIcon: (file) => applied.push(file) });
    expect(applied).toEqual([resolveWindowIcon()]);
  });
});

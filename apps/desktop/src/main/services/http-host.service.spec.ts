import { describe, expect, it, vi } from 'vitest';

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(async () => undefined),
}));

vi.mock('electron', () => ({
  shell: { openExternal },
}));

import { HttpHost } from './http-host.service';

describe('HttpHost', () => {
  it('rejects non-http(s) URLs in openUrl', async () => {
    const host = new HttpHost();
    await expect(host.openUrl('javascript:alert(1)')).rejects.toThrow(/http and https/);
    await expect(host.openUrl('file:///etc/passwd')).rejects.toThrow(/http and https/);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens safe http and https URLs externally', async () => {
    openExternal.mockClear();
    const host = new HttpHost();
    await host.openUrl('https://example.com/path');
    expect(openExternal).toHaveBeenCalledWith('https://example.com/path');
  });

  it('returns inactive device poll when session is unknown', async () => {
    const host = new HttpHost();
    const result = await host.devicePoll('missing-session');
    expect(result.ok).toBe(false);
    expect(result.pending).toBe(false);
    expect(result.error).toMatch(/not active/i);
  });

  it('ignores empty abort ids', () => {
    const host = new HttpHost();
    expect(() => host.abort('   ')).not.toThrow();
  });
});

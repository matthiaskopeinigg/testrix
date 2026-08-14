import { describe, expect, it } from 'vitest';

import { matchInstallerAsset } from './installer-asset-resolver';

describe('installer-asset-resolver', () => {
  it('matches exact asset names per platform', () => {
    const assets = [{ name: 'Testrix Setup.exe', browser_download_url: 'https://example.com/a.exe', size: 10 }];
    expect(matchInstallerAsset(assets, 'win32')?.name).toBe('Testrix Setup.exe');
  });

  it('falls back to fuzzy Testrix Setup asset names', () => {
    const assets = [
      {
        name: 'artifacts/Testrix Setup.exe',
        browser_download_url: 'https://example.com/nested.exe',
        size: 20,
      },
    ];
    expect(matchInstallerAsset(assets, 'win32')?.downloadUrl).toBe('https://example.com/nested.exe');
  });

  it('matches GitHub dotted asset names', () => {
    const assets = [
      {
        name: 'Testrix.Setup.exe',
        browser_download_url: 'https://example.com/setup.exe',
        size: 20,
      },
    ];
    expect(matchInstallerAsset(assets, 'win32')?.name).toBe('Testrix.Setup.exe');
  });

  it('returns null when no compatible asset exists', () => {
    expect(matchInstallerAsset([{ name: 'readme.txt' }], 'win32')).toBeNull();
  });
});

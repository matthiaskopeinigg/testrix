import { describe, expect, it } from 'vitest';

import { resolveInstallerAssetName } from './installer-artifacts';

describe('installer-artifacts', () => {
  it('maps platforms to shipped GitHub asset names', () => {
    expect(resolveInstallerAssetName('win32')).toBe('Testrix Setup.exe');
    expect(resolveInstallerAssetName('linux')).toBe('Testrix Setup.AppImage');
    expect(resolveInstallerAssetName('darwin')).toBe('Testrix Setup.dmg');
  });
});

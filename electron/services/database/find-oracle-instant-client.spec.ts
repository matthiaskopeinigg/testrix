import { describe, expect, it } from 'vitest';

import { oracleClientLibraryName, resolveOracleClientLibDir } from './find-oracle-instant-client';

describe('resolveOracleClientLibDir', () => {
  it('accepts a directory that contains the platform library', () => {
    const lib = oracleClientLibraryName();
    const exists = (filePath: string): boolean => filePath.replaceAll('\\', '/').endsWith(`client/${lib}`);
    expect(resolveOracleClientLibDir('C:/oracle/client', exists)?.replaceAll('\\', '/')).toBe(
      'C:/oracle/client',
    );
  });

  it('falls back to a bin subdirectory', () => {
    const lib = oracleClientLibraryName();
    const exists = (filePath: string): boolean =>
      filePath.replaceAll('\\', '/').endsWith(`dbhome/bin/${lib}`);
    expect(resolveOracleClientLibDir('C:/app/dbhome', exists)?.replaceAll('\\', '/')).toBe(
      'C:/app/dbhome/bin',
    );
  });
});

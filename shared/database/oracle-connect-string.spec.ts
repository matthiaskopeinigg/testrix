import { describe, expect, it } from 'vitest';

import { resolveOracleConnectString } from './oracle-connect-string';

describe('resolveOracleConnectString', () => {
  it('builds Easy Connect from host, port, and service name', () => {
    expect(
      resolveOracleConnectString({ host: 'db.example', port: 1521, database: 'XEPDB1' }),
    ).toBe('db.example:1521/XEPDB1');
  });

  it('keeps a full Easy Connect or TNS descriptor in the database field', () => {
    expect(
      resolveOracleConnectString({ host: 'ignored', port: 1521, database: 'localhost:1521/ORCL' }),
    ).toBe('localhost:1521/ORCL');
    expect(
      resolveOracleConnectString({
        database: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCL)))',
      }),
    ).toContain('DESCRIPTION');
  });

  it('defaults to XE when the service name is empty', () => {
    expect(resolveOracleConnectString({ host: 'localhost' })).toBe('localhost:1521/XE');
  });

  it('builds a TNS SID descriptor like DataGrip SID mode', () => {
    expect(
      resolveOracleConnectString({
        host: 'db.example',
        port: 1521,
        database: 'ORCL',
        useSid: true,
      }),
    ).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example)(PORT=1521))(CONNECT_DATA=(SID=ORCL)))',
    );
  });
});

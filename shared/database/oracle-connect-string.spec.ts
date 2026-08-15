import { describe, expect, it } from 'vitest';

import { resolveOracleConnectString } from './oracle-connect-string';

describe('resolveOracleConnectString', () => {
  it('builds a SERVICE_NAME TNS descriptor like DataGrip service mode', () => {
    expect(
      resolveOracleConnectString({ host: 'db.example', port: 1521, database: 'XEPDB1' }),
    ).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=XEPDB1)))',
    );
  });

  it('keeps a full TNS descriptor in the database field', () => {
    const tns =
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCL)))';
    expect(resolveOracleConnectString({ host: 'ignored', port: 1521, database: tns })).toBe(tns);
  });

  it('parses Easy Connect and JDBC thin service URLs', () => {
    expect(
      resolveOracleConnectString({
        host: 'ignored',
        database: 'jdbc:oracle:thin:@//db.example:1521/ORCLPDB1',
      }),
    ).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCLPDB1)))',
    );
    expect(
      resolveOracleConnectString({ database: 'localhost:1521/ORCL' }),
    ).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=ORCL)))',
    );
  });

  it('defaults to XE when the service name is empty', () => {
    expect(resolveOracleConnectString({ host: 'localhost' })).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=localhost)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=XE)))',
    );
  });

  it('builds a TNS SID descriptor when Use SID is on', () => {
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

  it('parses DataGrip SID URL fragments as SID even when Use SID is off', () => {
    expect(
      resolveOracleConnectString({
        database: 'jdbc:oracle:thin:@db.example:1521:ORCL',
        useSid: false,
      }),
    ).toBe(
      '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=db.example)(PORT=1521))(CONNECT_DATA=(SID=ORCL)))',
    );
  });
});

import { describe, expect, it } from 'vitest';

import { formatDatabaseConnectionError } from './format-database-connection-error';

describe('formatDatabaseConnectionError', () => {
  it('formats ECONNREFUSED', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    expect(formatDatabaseConnectionError(err)).toContain('Connection refused');
    expect(formatDatabaseConnectionError(err)).toContain('127.0.0.1:5432');
  });

  it('unwraps AggregateError', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED ::1:5432'), {
      code: 'ECONNREFUSED',
    });
    expect(formatDatabaseConnectionError(new AggregateError([inner]))).toContain('Connection refused');
  });

  it('formats timeout messages', () => {
    const message = formatDatabaseConnectionError(new Error('timeout expired'));
    expect(message).toMatch(/timed out|timeout expired/i);
  });

  it('does not treat a missing table as a missing database', () => {
    const wrapped = new Error(
      'Error invoking remote method \'db:query\': TestrixError: DATABASE_CONNECTION_FAILED: relation "users" does not exist',
    );
    expect(formatDatabaseConnectionError(wrapped)).toBe(
      'Table or view "users" does not exist. Check the name and schema.',
    );
  });

  it('formats a missing database name', () => {
    expect(
      formatDatabaseConnectionError(new Error('database "testrix" does not exist')),
    ).toBe('Database does not exist. Check the database name or create it first.');
  });

  it('explains Oracle Thin-mode 10G password verifiers', () => {
    const message = formatDatabaseConnectionError(
      new Error('NJS-116: password verifier type 0x939 is not supported by node-oracledb in Thin mode'),
    );
    expect(message).toMatch(/DataGrip/i);
    expect(message).toMatch(/Instant Client/i);
    expect(message).toMatch(/password is fine/i);
  });

  it('explains ORA-12505 SID vs service name', () => {
    const message = formatDatabaseConnectionError(
      new Error(
        'ORA-12505: TNS:listener does not currently know of SID given in connect descriptor',
      ),
    );
    expect(message).toMatch(/ORA-12505/);
    expect(message).toMatch(/Use SID/i);
    expect(message).toMatch(/service name/i);
  });
});

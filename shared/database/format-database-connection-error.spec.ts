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
});

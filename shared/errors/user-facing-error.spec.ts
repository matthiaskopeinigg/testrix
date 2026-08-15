import { describe, expect, it } from 'vitest';

import { userFacingErrorTitle } from './user-facing-error';

describe('userFacingErrorTitle', () => {
  it('never surfaces IPC_HANDLER_FAILED to the user', () => {
    expect(userFacingErrorTitle('IPC_HANDLER_FAILED')).toBe('Something went wrong');
    expect(userFacingErrorTitle('IPC_HANDLER_FAILED')).not.toMatch(/IPC/i);
  });

  it('maps database failures without exposing the code', () => {
    expect(userFacingErrorTitle('DATABASE_CONNECTION_FAILED')).toBe('Database error');
    expect(userFacingErrorTitle('DATABASE_CONNECTION_FAILED')).not.toContain('DATABASE');
  });

  it('falls back for unknown codes', () => {
    expect(userFacingErrorTitle('NOT_A_REAL_CODE')).toBe('Something went wrong');
  });
});

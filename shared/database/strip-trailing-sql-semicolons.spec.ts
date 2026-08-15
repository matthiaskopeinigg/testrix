import { describe, expect, it } from 'vitest';

import { stripTrailingSqlSemicolons } from './strip-trailing-sql-semicolons';

describe('stripTrailingSqlSemicolons', () => {
  it('removes one or more trailing semicolons', () => {
    expect(stripTrailingSqlSemicolons('SELECT * FROM SADA;')).toBe('SELECT * FROM SADA');
    expect(stripTrailingSqlSemicolons('SELECT 1;;\n')).toBe('SELECT 1');
  });

  it('leaves internal semicolons alone', () => {
    expect(stripTrailingSqlSemicolons("SELECT ';';")).toBe("SELECT ';'");
  });
});

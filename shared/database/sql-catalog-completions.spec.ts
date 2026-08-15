import { describe, expect, it } from 'vitest';

import { mergeDatabaseQueryCompletions } from './sql-catalog-completions';

describe('mergeDatabaseQueryCompletions', () => {
  const catalog = {
    schemas: [{ name: 'public', system: false }],
    tables: [{ schema: 'public', name: 'users', kind: 'table' as const }],
    columnsByTable: {
      'public.users': [
        { name: 'id', type: 'integer', nullable: false, primaryKey: true },
        { name: 'email', type: 'text', nullable: true, primaryKey: false },
      ],
    },
  };

  it('includes catalog tables and keywords', () => {
    const items = mergeDatabaseQueryCompletions('postgresql', catalog, 'SELECT * FROM ', 16);
    expect(items.some((item) => item.label === 'users')).toBe(true);
    expect(items.some((item) => item.label === 'SELECT')).toBe(true);
  });

  it('prefers columns of the FROM table and dotted table.column', () => {
    const fromCols = mergeDatabaseQueryCompletions(
      'postgresql',
      catalog,
      'SELECT * FROM users WHERE ',
      26,
    );
    expect(fromCols[0]?.label).toBe('id');
    const dotted = mergeDatabaseQueryCompletions(
      'postgresql',
      catalog,
      'SELECT users.',
      13,
    );
    expect(dotted[0]?.insert).toBe('users.id');
  });
});

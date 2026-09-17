import { describe, expect, it } from 'vitest';

import { applyClauseSuggestion, clauseGhost, pairSqlKey, sqlTokenAt, suggestClause, unpairSqlKey } from './database-clause-complete';

const context = {
  columns: [{ name: 'id', type: 'integer' }, { name: 'name', type: 'varchar' }],
  schemas: ['public', 'app'],
  tables: [{ schema: 'public', name: 'sample_items' }, { schema: 'app', name: 'users' }],
  currentSchema: 'public',
  currentTable: 'sample_items',
  mode: 'where' as const,
};

describe('sqlTokenAt', () => {
  it('reads the identifier under the cursor', () => {
    expect(sqlTokenAt('id = na', 7)).toEqual({ start: 5, end: 7, text: 'na' });
  });
});

describe('suggestClause', () => {
  it('prefers matching columns and keywords', () => {
    const items = suggestClause('na', 2, context);
    expect(items.map((item) => item.value)).toContain('name');
    expect(items.some((item) => item.kind === 'keyword')).toBe(false);
  });

  it('includes schemas and tables when the prefix matches', () => {
    const items = suggestClause('pub', 3, context);
    expect(items.map((item) => item.value)).toContain('public');
    expect(items.map((item) => item.value)).toContain('public.sample_items');
  });
});

describe('applyClauseSuggestion', () => {
  it('replaces the current token', () => {
    expect(applyClauseSuggestion('id = na', 7, 'name')).toEqual({ value: 'id = name', cursor: 9 });
  });
});

describe('pairSqlKey', () => {
  it('inserts a matching quote and keeps the caret inside', () => {
    expect(pairSqlKey('name = ', 7, "'")).toEqual({ value: "name = ''", cursor: 8 });
  });

  it('skips an existing closer while inside the pair', () => {
    expect(pairSqlKey("name = ''", 8, "'")).toEqual({ value: "name = ''", cursor: 9 });
  });

  it('turns a leftover closer into an empty pair instead of skipping', () => {
    expect(pairSqlKey("'", 0, "'")).toEqual({ value: "''", cursor: 1 });
  });
});

describe('unpairSqlKey', () => {
  it('deletes both quotes of an empty pair', () => {
    expect(unpairSqlKey("''", 1)).toEqual({ value: '', cursor: 0 });
    expect(unpairSqlKey("name = ''", 8)).toEqual({ value: 'name = ', cursor: 7 });
  });

  it('leaves a filled string alone', () => {
    expect(unpairSqlKey("'ab'", 1)).toBeNull();
  });
});

describe('clauseGhost', () => {
  it('shows the untyped suffix of a prefix match', () => {
    expect(clauseGhost('na', 2, { value: 'name', label: 'name', detail: 'column', kind: 'column' })).toEqual({
      pad: 'na',
      rest: 'me',
    });
  });

  it('hides when the token is not a prefix', () => {
    expect(clauseGhost('id', 2, { value: 'name', label: 'name', detail: 'column', kind: 'column' })).toBeNull();
  });
});

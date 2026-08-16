import { describe, expect, it } from 'vitest';

import { sortDatabaseSchemasSelectedFirst } from './database-schema-picker-dialog.component';

describe('sortDatabaseSchemasSelectedFirst', () => {
  it('keeps selected schemas at the top, then sorts each group A–Z', () => {
    const sorted = sortDatabaseSchemasSelectedFirst(
      [
        { name: 'SCOTT', system: false },
        { name: 'HR', system: false },
        { name: 'SYS', system: true },
        { name: 'APPS', system: false },
      ],
      new Set(['sys', 'hr']),
    );
    expect(sorted.map((schema) => schema.name)).toEqual(['HR', 'SYS', 'APPS', 'SCOTT']);
  });
});

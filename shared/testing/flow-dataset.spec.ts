import { describe, expect, it } from 'vitest';

import {
  collectDatasetVariableKeys,
  datasetRowDisplaySuffix,
  parseDatasetCsv,
  parseDatasetJson,
} from './flow-dataset';

describe('flow-dataset', () => {
  it('parses a CSV header row into records', () => {
    const rows = parseDatasetCsv('email,role\nadmin@x.test,admin\nuser@x.test,user');
    expect(rows).toEqual([
      { email: 'admin@x.test', role: 'admin' },
      { email: 'user@x.test', role: 'user' },
    ]);
  });

  it('parses a JSON array of objects', () => {
    const rows = parseDatasetJson('[{"email":"a@x.test","n":1}]');
    expect(rows).toEqual([{ email: 'a@x.test', n: '1' }]);
  });

  it('collects enabled column keys', () => {
    expect(
      collectDatasetVariableKeys({
        enabled: true,
        rows: [{ email: 'a', unused: '' }],
      }),
    ).toEqual(['email', 'unused']);
  });

  it('builds a display suffix from the first non-empty cell', () => {
    expect(datasetRowDisplaySuffix(2, { email: 'admin@x.test' })).toBe(' · row 3 · admin@x.test');
  });
});

import { describe, expect, it } from 'vitest';

import { kvPairsToRows, rowsToKvPairs } from './flow-step-kv';

describe('flow-step-kv', () => {
  it('round-trips key-value pairs', () => {
    const rows = kvPairsToRows([{ key: 'Authorization', value: 'Bearer x', enabled: true }]);
    expect(rowsToKvPairs(rows)).toEqual([{ key: 'Authorization', value: 'Bearer x', enabled: true }]);
  });
});

import { describe, expect, it } from 'vitest';

import { kvPairsToRows, rowsToKvPairs } from './flow-step-kv';

describe('flow-step-kv', () => {
  it('round-trips key-value pairs including row ids', () => {
    const rows = kvPairsToRows([
      { id: 'hdr-1', key: 'Authorization', value: 'Bearer x', enabled: true },
    ]);
    expect(rowsToKvPairs(rows)).toEqual([
      { id: 'hdr-1', key: 'Authorization', value: 'Bearer x', enabled: true },
    ]);
  });

  it('keeps a stable row id when the key changes from empty', () => {
    const before = kvPairsToRows([{ key: '', value: '', enabled: true }]);
    const after = kvPairsToRows([{ key: 'C', value: '', enabled: true }]);
    expect(before[0]?.id).toBe('kv-0');
    expect(after[0]?.id).toBe(before[0]?.id);
  });
});

import type { TestSuiteKeyValuePair } from '@shared/testing';

import type { TxKeyValueRow } from '@app/shared/components/tx-key-value-list/tx-key-value-list.types';

/** Maps flow step KV pairs to key-value list rows. */
export function kvPairsToRows(pairs: readonly TestSuiteKeyValuePair[]): readonly TxKeyValueRow[] {
  return pairs.map((pair, index) => ({
    id: `kv-${index}-${pair.key || 'empty'}`,
    enabled: pair.enabled,
    key: pair.key,
    value: pair.value,
  }));
}

/** Maps key-value list rows back to flow step KV pairs. */
export function rowsToKvPairs(rows: readonly TxKeyValueRow[]): TestSuiteKeyValuePair[] {
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    enabled: row.enabled,
  }));
}

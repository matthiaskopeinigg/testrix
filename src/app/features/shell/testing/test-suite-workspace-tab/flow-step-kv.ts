import type { TestSuiteKeyValuePair } from '@shared/testing';

import type { TxKeyValueRow } from '@app/shared/components/data/tx-key-value-list/tx-key-value-list.types';

/** Maps flow step KV pairs to key-value list rows with stable ids. */
export function kvPairsToRows(pairs: readonly TestSuiteKeyValuePair[]): readonly TxKeyValueRow[] {
  return pairs.map((pair, index) => ({
    id: pair.id?.trim() || `kv-${index}`,
    enabled: pair.enabled,
    key: pair.key,
    value: pair.value,
    description: pair.description,
  }));
}

/** Maps key-value list rows back to flow step KV pairs, keeping row ids. */
export function rowsToKvPairs(rows: readonly TxKeyValueRow[]): TestSuiteKeyValuePair[] {
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    enabled: row.enabled,
    description: row.description?.trim() || undefined,
  }));
}

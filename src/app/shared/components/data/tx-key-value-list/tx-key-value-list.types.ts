/** Row model for `tx-key-value-list` (aligned with `HttpKeyValueRow` in shared config). */
export interface TxKeyValueRow {
  readonly id: string;
  readonly enabled: boolean;
  readonly key: string;
  readonly value: string;
  /** Optional notes (HTTP header rows in collections/settings). */
  readonly description?: string;
}

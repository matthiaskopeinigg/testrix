/** Row model for `tx-key-value-description-list`. */
export interface TxKeyValueDescriptionRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly description?: string;
  /** When set, row can be toggled (query params). */
  readonly enabled?: boolean;
}

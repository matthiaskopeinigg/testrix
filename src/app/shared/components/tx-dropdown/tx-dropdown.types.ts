import type { TxIconName } from '../../icons/tx-icon.registry';

/** Single selectable row in `tx-dropdown`. */
export interface TxDropdownOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
  readonly icon?: TxIconName;
}

export type TxDropdownPlacement = 'bottom-start' | 'bottom-end';

import type { TxIconName } from '@app/shared/icons';

/** Single actionable entry in a context menu. */
export interface TxContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: TxIconName;
  readonly disabled?: boolean;
  readonly danger?: boolean;
  readonly separator?: boolean;
  /** When true, shows a check mark (e.g. radio-style toolbar menus). */
  readonly selected?: boolean;
}

/** Viewport position for a fixed context menu panel. */
export interface TxContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

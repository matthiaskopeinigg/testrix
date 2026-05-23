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

/** True for explicit danger items and common delete/remove menu actions. */
export function isDestructiveContextMenuItem(item: TxContextMenuItem): boolean {
  if (item.separator || item.disabled) {
    return false;
  }
  if (item.danger) {
    return true;
  }
  if (item.icon === 'trash') {
    return true;
  }

  const id = item.id.toLowerCase();
  return id === 'delete' || id.endsWith('-delete') || id.startsWith('delete-') || id === 'clear-all';
}

/** Viewport position for a fixed context menu panel. */
export interface TxContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

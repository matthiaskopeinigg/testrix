import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

export type LookupContextMenuAction = 'new-lookup' | 'open' | 'rename' | 'delete';

/** Menu for right-click on empty lookup list area. */
export function buildEmptyLookupContextMenu(): TxContextMenuItem[] {
  return [{ id: 'new-lookup', label: 'New lookup', icon: 'search' }];
}

/** Menu for a lookup row. */
export function buildLookupNodeContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'open', label: 'Open', icon: 'folderOpen' },
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

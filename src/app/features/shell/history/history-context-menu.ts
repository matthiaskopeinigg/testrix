import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

/** Menu for right-click on empty sidebar / tree area. */
export function buildEmptyHistoryContextMenu(): TxContextMenuItem[] {
  return [{ id: 'clear-all', label: 'Clear history', icon: 'trash', danger: true }];
}

/** Menu for a history tree row. */
export function buildHistoryNodeContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'rerun', label: 'Re-run request', icon: 'play' },
    { id: 'delete', label: 'Remove from history', icon: 'trash', danger: true },
  ];
}

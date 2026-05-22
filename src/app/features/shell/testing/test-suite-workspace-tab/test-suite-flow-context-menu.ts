import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

/** Context menu for empty flow step tree area. */
export function buildEmptyFlowStepContextMenu(): readonly TxContextMenuItem[] {
  return [{ id: 'add-step', label: 'Add step…', icon: 'plus' }];
}

/** Context menu for a flow step row. */
export function buildFlowStepContextMenu(): readonly TxContextMenuItem[] {
  return [
    { id: 'clone', label: 'Clone', icon: 'copy' },
    { id: 'delete', label: 'Delete step', icon: 'trash', danger: true },
  ];
}

import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

import type { DatabaseTreeKind } from './database-tree.types';

export type DatabaseContextMenuAction =
  | 'new-folder'
  | 'new-query'
  | 'open'
  | 'rename'
  | 'duplicate'
  | 'delete'
  | 'expand';

/** Menu for right-click on empty tree area (root-level create). */
export function buildEmptyDatabaseContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-query', label: 'New query', icon: 'database' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildDatabaseNodeContextMenu(
  kind: DatabaseTreeKind,
  expanded: boolean,
  hasChildren = true,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-folder', label: 'New folder', icon: 'folder' },
      { id: 'new-query', label: 'New query', icon: 'database' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
    ];
    if (!expanded) {
      items.push(
        { id: 'sep-2', label: '', separator: true },
        { id: 'expand', label: 'Expand', icon: 'chevronDown' },
      );
    }
    return items;
  }

  return [
    { id: 'open', label: 'Open', icon: 'folderOpen' },
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { CollectionTreeKind } from './collection-tree.types';

export type CollectionContextMenuAction =
  | 'new-folder'
  | 'new-request'
  | 'new-websocket'
  | 'rename'
  | 'edit-description'
  | 'delete'
  | 'duplicate'
  | 'expand'
  | 'collapse';

/** Menu for right-click on empty sidebar / tree area (root-level create). */
export function buildEmptyCollectionContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-request', label: 'New request', icon: 'http' },
    { id: 'new-websocket', label: 'New websocket', icon: 'interceptor' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildCollectionNodeContextMenu(
  kind: CollectionTreeKind,
  expanded: boolean,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    return [
      { id: 'new-folder', label: 'New folder', icon: 'folder' },
      { id: 'new-request', label: 'New request', icon: 'http' },
      { id: 'new-websocket', label: 'New websocket', icon: 'interceptor' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'edit-description', label: 'Edit description…', icon: 'fileText' },
      { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
      { id: 'sep-2', label: '', separator: true },
      {
        id: expanded ? 'collapse' : 'expand',
        label: expanded ? 'Collapse' : 'Expand',
        icon: expanded ? 'chevronRight' : 'chevronDown',
      },
    ];
  }

  return [
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { CollectionTreeKind } from './collection-tree.types';

export type CollectionContextMenuAction =
  | 'new-folder'
  | 'new-request'
  | 'new-websocket'
  | 'open'
  | 'toggle-favourite'
  | 'rename'
  | 'edit-description'
  | 'delete'
  | 'duplicate'
  | 'expand'
  | 'export-selection';

/** Menu for right-click on empty sidebar / tree area (root-level create). */
export function buildEmptyCollectionContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-request', label: 'New request', icon: 'http' },
    { id: 'new-websocket', label: 'New websocket', icon: 'interceptor' },
  ];
}

function favouriteMenuItem(favourite: boolean): TxContextMenuItem {
  return favourite
    ? { id: 'toggle-favourite', label: 'Remove from favourites', icon: 'star' }
    : { id: 'toggle-favourite', label: 'Add to favourites', icon: 'star' };
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildCollectionNodeContextMenu(
  kind: CollectionTreeKind,
  expanded: boolean,
  hasChildren = true,
  favourite = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-folder', label: 'New folder', icon: 'folder' },
      { id: 'new-request', label: 'New request', icon: 'http' },
      { id: 'new-websocket', label: 'New websocket', icon: 'interceptor' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'open', label: 'Open', icon: 'folderOpen' },
      favouriteMenuItem(favourite),
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'edit-description', label: 'Edit description…', icon: 'fileText' },
      { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
    ];
    if (!expanded && hasChildren) {
      items.push(
        { id: 'sep-2', label: '', separator: true },
        { id: 'expand', label: 'Expand', icon: 'chevronDown' },
      );
    }
    items.push(
      { id: 'sep-export', label: '', separator: true },
      { id: 'export-selection', label: 'Export selection…', icon: 'copy' },
    );
    return items;
  }

  return [
    { id: 'open', label: 'Open', icon: 'folderOpen' },
    favouriteMenuItem(favourite),
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'export-selection', label: 'Export selection…', icon: 'copy' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

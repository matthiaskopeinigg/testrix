import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { CaptureTreeKind } from './capture-tree.types';

export type CaptureContextMenuAction =
  | 'new-folder'
  | 'new-session'
  | 'open'
  | 'rename'
  | 'delete'
  | 'expand';

/** Menu for right-click on empty tree area (root-level create). */
export function buildEmptyCaptureContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-session', label: 'New capture session', icon: 'globe' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildCaptureNodeContextMenu(
  kind: CaptureTreeKind,
  expanded: boolean,
  hasChildren = true,
  atRoot = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-session', label: 'New capture session', icon: 'globe' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
    ];
    if (atRoot) {
      items.unshift({ id: 'new-folder', label: 'New folder', icon: 'folder' });
    }
    if (!expanded && hasChildren) {
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
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { MockServerTreeKind } from './mock-server-tree.types';

export type MockServerContextMenuAction =
  | 'new-folder'
  | 'new-endpoint'
  | 'open'
  | 'rename'
  | 'delete'
  | 'expand';

/** Menu for right-click on empty tree area (root-level create). */
export function buildEmptyMockServerContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-endpoint', label: 'New endpoint', icon: 'api' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildMockServerNodeContextMenu(
  kind: MockServerTreeKind,
  expanded: boolean,
  hasChildren = true,
  atRoot = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-endpoint', label: 'New endpoint', icon: 'api' },
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

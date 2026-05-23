import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { InterceptorTreeKind } from './interceptor-tree.types';

export type InterceptorContextMenuAction =
  | 'new-folder'
  | 'new-rule'
  | 'open'
  | 'rename'
  | 'delete'
  | 'expand';

/** Menu for right-click on empty tree area (root-level create). */
export function buildEmptyInterceptorContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-rule', label: 'New rule', icon: 'interceptor' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildInterceptorNodeContextMenu(
  kind: InterceptorTreeKind,
  expanded: boolean,
  hasChildren = true,
  atRoot = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-rule', label: 'New rule', icon: 'interceptor' },
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

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { LoadTestTreeKind } from './load-test-tree.types';

export type LoadTestContextMenuAction =
  | 'new-folder'
  | 'new-artifact'
  | 'open'
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'expand'
  | 'export-selection';

/** Menu for right-click on empty sidebar / tree area (root-level create). */
export function buildEmptyLoadTestContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-artifact', label: 'New load test', icon: 'zap' },
  ];
}

/** Menu for a tree row based on node kind and expansion state. */
export function buildLoadTestNodeContextMenu(
  kind: LoadTestTreeKind,
  expanded: boolean,
  hasChildren = true,
  atRoot = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-artifact', label: 'New load test', icon: 'zap' },
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
    items.splice(items.length - 1, 0, { id: 'export-selection', label: 'Export selection…', icon: 'copy' });
    items.splice(items.length - 1, 0, { id: 'sep-export', label: '', separator: true });
    return items;
  }

  return [
    { id: 'open', label: 'Open', icon: 'folderOpen' },
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'export-selection', label: 'Export selection…', icon: 'copy' },
    { id: 'sep-1', label: '', separator: true },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

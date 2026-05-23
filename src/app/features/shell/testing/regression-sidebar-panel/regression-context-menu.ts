import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { RegressionTreeKind } from './regression-tree.types';

export type RegressionContextMenuAction =
  | 'new-folder'
  | 'new-artifact'
  | 'open'
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'expand'
  | 'archive'
  | 'restore'
  | 'run'
  | 'export-json';

/** Menu for right-click on empty sidebar / tree area (root-level create). */
export function buildEmptyRegressionContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-artifact', label: 'New regression', icon: 'target' },
  ];
}

/** Menu for a tree row based on node kind, expansion, and archive state. */
export function buildRegressionNodeContextMenu(
  kind: RegressionTreeKind,
  expanded: boolean,
  hasChildren = true,
  atRoot = false,
  archived = false,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-artifact', label: 'New regression', icon: 'target' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: 'edit' },
      archived
        ? { id: 'restore', label: 'Restore', icon: 'refresh' }
        : { id: 'archive', label: 'Archive', icon: 'box' },
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

  const items: TxContextMenuItem[] = [
    { id: 'open', label: 'Open', icon: 'folderOpen' },
    { id: 'run', label: 'Run regression', icon: 'play' },
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'export-json', label: 'Export JSON', icon: 'download' },
    archived
      ? { id: 'restore', label: 'Restore', icon: 'refresh' }
      : { id: 'archive', label: 'Archive', icon: 'box' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
  return items;
}


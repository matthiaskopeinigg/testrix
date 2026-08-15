import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';

import type { ConnectionTreeKind } from './connection-tree.types';

export type ConnectionContextMenuAction =
  | 'new-folder'
  | 'new-connection'
  | 'open'
  | 'edit'
  | 'refresh'
  | 'test'
  | 'new-query'
  | 'open-data'
  | 'copy-name'
  | 'show-ddl'
  | 'rename'
  | 'duplicate'
  | 'delete'
  | 'expand';

/** Menu for right-click on empty connection tree area (root-level create). */
export function buildEmptyConnectionContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-connection', label: 'New connection', icon: 'database' },
  ];
}

/** Menu for a connection tree row based on node kind and expansion state. */
export function buildConnectionNodeContextMenu(
  kind: ConnectionTreeKind,
  expanded: boolean,
  _hasChildren = true,
): TxContextMenuItem[] {
  if (kind === 'folder') {
    const items: TxContextMenuItem[] = [
      { id: 'new-connection', label: 'New connection', icon: 'database' },
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

  if (kind === 'connection') {
    return [
      { id: 'open', label: 'Open catalog', icon: 'folderOpen' },
      { id: 'open-data', label: 'Open data', icon: 'play' },
      { id: 'new-query', label: 'New query', icon: 'fileText' },
      { id: 'refresh', label: 'Refresh', icon: 'refresh' },
      { id: 'test', label: 'Test connection', icon: 'play' },
      { id: 'edit', label: 'Edit', icon: 'edit' },
      { id: 'sep-1', label: '', separator: true },
      { id: 'rename', label: 'Rename', icon: 'edit' },
      { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
      { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
    ];
  }

  if (kind === 'schema') {
    return [
      { id: 'refresh', label: 'Refresh', icon: 'refresh' },
      { id: 'new-query', label: 'New query', icon: 'fileText' },
      { id: 'copy-name', label: 'Copy name', icon: 'copy' },
    ];
  }

  if (kind === 'group') {
    return [{ id: 'refresh', label: 'Refresh', icon: 'refresh' }];
  }

  if (kind === 'table') {
    return [
      { id: 'open-data', label: 'Open data', icon: 'play' },
      { id: 'new-query', label: 'New query', icon: 'fileText' },
      { id: 'refresh', label: 'Refresh', icon: 'refresh' },
      { id: 'show-ddl', label: 'Show DDL', icon: 'fileText' },
      { id: 'copy-name', label: 'Copy qualified name', icon: 'copy' },
    ];
  }

  if (kind === 'view') {
    return [
      { id: 'open-data', label: 'Open data', icon: 'play' },
      { id: 'new-query', label: 'New query', icon: 'fileText' },
      { id: 'show-ddl', label: 'Show DDL', icon: 'fileText' },
      { id: 'copy-name', label: 'Copy name', icon: 'copy' },
    ];
  }

  if (kind === 'column') {
    return [
      { id: 'copy-name', label: 'Copy name', icon: 'copy' },
      { id: 'copy-qualified', label: 'Copy table.column', icon: 'copy' },
    ];
  }

  if (kind === 'index' || kind === 'foreignKey') {
    return [{ id: 'copy-name', label: 'Copy name', icon: 'copy' }];
  }

  if (kind === 'status') {
    return [{ id: 'refresh', label: 'Retry', icon: 'refresh' }];
  }

  return [];
}

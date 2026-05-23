import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { EnvironmentTreeKind } from './environment-tree.types';

/** Menu for right-click on empty environments list sidebar. */
export function buildEmptyEnvironmentListContextMenu(): TxContextMenuItem[] {
  return [{ id: 'new-environment', label: 'New environment', icon: 'globe' }];
}

/** Menu for a sidebar environment row. */
export function buildEnvironmentListRowContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'clone', label: 'Clone', icon: 'copy' },
    { id: 'sep-1', label: '', separator: true },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

/** Menu for right-click on empty tree area inside an environment tab. */
export function buildEmptyEnvironmentScopeContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-variable', label: 'New variable', icon: 'hash' },
  ];
}

/** @deprecated Use list or scope empty menu helpers. */
export function buildEmptyEnvironmentContextMenu(): TxContextMenuItem[] {
  return buildEmptyEnvironmentListContextMenu();
}

/** Menu for a folder row. */
export function buildEnvironmentFolderContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'add-variable-inside', label: 'Add variable inside', icon: 'plus' },
    { id: 'sep-1', label: '', separator: true },
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'edit-description', label: 'Edit description…', icon: 'fileText' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

/** Menu for a variable row. */
export function buildEnvironmentVariableContextMenu(): TxContextMenuItem[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ];
}

/** Resolves menu items for a tree row. */
export function buildEnvironmentNodeContextMenu(kind: EnvironmentTreeKind): TxContextMenuItem[] {
  if (kind === 'folder') {
    return buildEnvironmentFolderContextMenu();
  }
  return buildEnvironmentVariableContextMenu();
}

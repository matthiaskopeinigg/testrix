import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { TestSuiteTreeKind } from './test-suite-tree.types';

/** Context menu for empty suite tree area. */
export function buildEmptyTestSuiteContextMenu(): readonly TxContextMenuItem[] {
  return [
    { id: 'new-folder', label: 'New folder', icon: 'folder' },
    { id: 'new-flow', label: 'New flow', icon: 'play' },
  ];
}

/** Context menu for a suite tree row. */
export function buildTestSuiteNodeContextMenu(
  kind: TestSuiteTreeKind,
): readonly TxContextMenuItem[] {
  const items: TxContextMenuItem[] = [
    { id: 'rename', label: 'Rename', icon: 'edit' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
  ];

  if (kind === 'folder') {
    items.unshift(
      { id: 'new-folder', label: 'New folder', icon: 'folder' },
      { id: 'new-flow', label: 'New flow', icon: 'play' },
      { id: 'sep-create', label: '', separator: true },
    );
  }

  items.push({ id: 'delete', label: 'Delete', icon: 'trash', danger: true });
  items.splice(items.length - 1, 0, { id: 'export-selection', label: 'Export selection…', icon: 'copy' });
  items.splice(items.length - 1, 0, { id: 'sep-export', label: '', separator: true });
  return items;
}

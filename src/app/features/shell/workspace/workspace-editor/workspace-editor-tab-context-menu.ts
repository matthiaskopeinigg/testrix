import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';

import type { WorkspaceEditorSplitZone } from '@app/core/workspace/workspace-tab-drag';

export type WorkspaceSplitContextMenuAction = `split-${WorkspaceEditorSplitZone}`;

export type WorkspaceTabContextMenuAction =
  | 'close'
  | 'close-others'
  | 'close-to-right'
  | 'close-all'
  | 'pin'
  | 'unpin'
  | WorkspaceSplitContextMenuAction
  | 'close-pane'
  | 'merge-single';

export type WorkspaceTabBarContextMenuAction =
  | WorkspaceSplitContextMenuAction
  | 'close-all'
  | 'close-pane'
  | 'merge-single';

export type WorkspaceEmptyPaneContextMenuAction = 'close-pane' | 'merge-single';

const SPLIT_MENU_ITEMS: readonly TxContextMenuItem[] = [
  { id: 'split-left', label: 'Split left', icon: 'chevronLeft' },
  { id: 'split-right', label: 'Split right', icon: 'chevronRight' },
  { id: 'split-top', label: 'Split up', icon: 'chevronUp' },
  { id: 'split-bottom', label: 'Split down', icon: 'chevronDown' },
];

export interface BuildWorkspaceTabContextMenuOptions {
  readonly pinned: boolean;
  readonly tabCount: number;
  readonly hasTabsToRight: boolean;
  readonly canClosePane: boolean;
  readonly hasMultiplePanes: boolean;
}

/**
 * Context menu for a single editor tab (right-click on tab chip).
 */
export function buildWorkspaceTabContextMenu(
  options: BuildWorkspaceTabContextMenuOptions,
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = [
    { id: 'close', label: 'Close', icon: 'close' },
    {
      id: 'close-others',
      label: 'Close others',
      icon: 'close',
      disabled: options.tabCount <= 1,
    },
    {
      id: 'close-to-right',
      label: 'Close to the right',
      icon: 'close',
      disabled: !options.hasTabsToRight,
    },
    { id: 'close-all', label: 'Close all', icon: 'close' },
    { id: 'sep-close', label: '', separator: true },
    {
      id: options.pinned ? 'unpin' : 'pin',
      label: options.pinned ? 'Unpin' : 'Pin tab',
      icon: 'bookmark',
    },
    { id: 'sep-split', label: '', separator: true },
    ...SPLIT_MENU_ITEMS,
  ];

  if (options.canClosePane) {
    items.push(
      { id: 'sep-pane', label: '', separator: true },
      { id: 'close-pane', label: 'Close editor group', icon: 'close' },
    );
  }

  if (options.hasMultiplePanes) {
    items.push({ id: 'merge-single', label: 'Reset to single pane', icon: 'maximizeRestore' });
  }

  return items;
}

export interface BuildWorkspaceTabBarContextMenuOptions {
  readonly canClosePane: boolean;
  readonly hasMultiplePanes: boolean;
}

/** Context menu for empty tab-bar strip (right-click beside tabs). */
export function buildWorkspaceTabBarContextMenu(
  options: BuildWorkspaceTabBarContextMenuOptions,
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = [];

  if (options.hasMultiplePanes) {
    items.push({ id: 'merge-single', label: 'Reset to single pane', icon: 'maximizeRestore' });
    if (options.canClosePane) {
      items.push({ id: 'close-pane', label: 'Close editor group', icon: 'close' });
    }
    items.push({ id: 'sep-layout', label: '', separator: true });
  } else if (options.canClosePane) {
    items.push({ id: 'close-pane', label: 'Close editor group', icon: 'close' });
    items.push({ id: 'sep-layout', label: '', separator: true });
  }

  items.push(...SPLIT_MENU_ITEMS, { id: 'sep-1', label: '', separator: true }, {
    id: 'close-all',
    label: 'Close all tabs',
    icon: 'close',
  });

  return items;
}

/** Context menu for empty pane body (no tabs open in this group). */
export function buildWorkspaceEmptyPaneContextMenu(
  options: BuildWorkspaceTabBarContextMenuOptions,
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = [];

  if (options.hasMultiplePanes) {
    items.push({ id: 'merge-single', label: 'Reset to single pane', icon: 'maximizeRestore' });
  }

  if (options.canClosePane) {
    items.push({ id: 'close-pane', label: 'Close this editor group', icon: 'close' });
  }

  return items;
}

/**
 * Parses a split-* context menu action id into a cardinal zone.
 */
export function parseSplitContextMenuAction(
  actionId: string,
): WorkspaceEditorSplitZone | null {
  switch (actionId) {
    case 'split-left':
      return 'left';
    case 'split-right':
      return 'right';
    case 'split-top':
      return 'top';
    case 'split-bottom':
      return 'bottom';
    default:
      return null;
  }
}

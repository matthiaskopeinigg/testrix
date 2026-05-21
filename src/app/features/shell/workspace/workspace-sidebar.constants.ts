import type { TxSidebarItem } from '@app/shared/components/tx-sidebar/tx-sidebar.types';

/** Primary icon rail entries shared by home and dev workspace routes. */
export const WORKSPACE_SIDEBAR_MAIN_ITEMS: readonly TxSidebarItem[] = [
  { id: 'collections', label: 'Collections', icon: 'folder' },
  { id: 'environments', label: 'Environments', icon: 'globe' },
  { id: 'testing', label: 'Testing', icon: 'testing' },
  { id: 'development', label: 'Development', icon: 'development' },
];

/** Footer rail entries (optional debug toolkit, history, help). */
export function workspaceSidebarFooterItems(includeDebug: boolean): readonly TxSidebarItem[] {
  const items: TxSidebarItem[] = [];

  if (includeDebug) {
    items.push({ id: 'debug', label: 'Debug', icon: 'grid' });
  }

  items.push(
    { id: 'history', label: 'History', icon: 'clock' },
    { id: 'help', label: 'Help', icon: 'help', opensPanel: false },
  );

  return items;
}

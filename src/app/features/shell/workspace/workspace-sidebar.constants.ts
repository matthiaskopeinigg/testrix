import type { TxSidebarItem } from '@app/shared/components/chrome/tx-sidebar/tx-sidebar.types';
import type { TxIconName } from '@app/shared/icons';
import {
  WORKSPACE_SIDEBAR_FOOTER_LABELS,
  WORKSPACE_SIDEBAR_USER_ITEM_ICONS,
  WORKSPACE_SIDEBAR_USER_ITEM_IDS,
  WORKSPACE_SIDEBAR_USER_ITEM_LABELS,
  resolveWorkspaceSidebarRail,
  type WorkspaceSidebarFooterPinnedId,
  type WorkspaceSidebarUserItemId,
} from '@shared/config';

const DEBUG_ITEM: TxSidebarItem = { id: 'debug', label: WORKSPACE_SIDEBAR_FOOTER_LABELS.debug, icon: 'grid' };
const HELP_ITEM: TxSidebarItem = {
  id: 'help',
  label: WORKSPACE_SIDEBAR_FOOTER_LABELS.help,
  icon: 'help',
  opensPanel: false,
};

const USER_ITEMS: Record<WorkspaceSidebarUserItemId, TxSidebarItem> = {
  collections: {
    id: 'collections',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.collections,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.collections as TxIconName,
  },
  environments: {
    id: 'environments',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.environments,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.environments as TxIconName,
  },
  testing: {
    id: 'testing',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.testing,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.testing as TxIconName,
  },
  data: {
    id: 'data',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.data,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.data as TxIconName,
  },
  development: {
    id: 'development',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.development,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.development as TxIconName,
  },
  history: {
    id: 'history',
    label: WORKSPACE_SIDEBAR_USER_ITEM_LABELS.history,
    icon: WORKSPACE_SIDEBAR_USER_ITEM_ICONS.history as TxIconName,
  },
};

/** Primary icon rail entries shared by home and dev workspace routes. */
export const WORKSPACE_SIDEBAR_MAIN_ITEMS: readonly TxSidebarItem[] = WORKSPACE_SIDEBAR_USER_ITEM_IDS.filter(
  (id) => id !== 'history',
).map((id) => USER_ITEMS[id]);

/**
 * Maps a resolved rail id to a {@link TxSidebarItem}.
 */
export function workspaceSidebarTxItem(
  id: WorkspaceSidebarUserItemId | WorkspaceSidebarFooterPinnedId,
): TxSidebarItem {
  if (id === 'debug') {
    return DEBUG_ITEM;
  }
  if (id === 'help') {
    return HELP_ITEM;
  }
  return USER_ITEMS[id];
}

/**
 * Builds main and footer rail items from persisted order/visibility.
 */
export function buildWorkspaceSidebarRailItems(
  order: readonly string[],
  hidden: readonly string[],
  includeDebug: boolean,
): { readonly main: readonly TxSidebarItem[]; readonly footer: readonly TxSidebarItem[] } {
  const ids = resolveWorkspaceSidebarRail(order, hidden, { includeDebug });
  return {
    main: ids.main.map(workspaceSidebarTxItem),
    footer: ids.footer.map(workspaceSidebarTxItem),
  };
}

/** Footer rail entries (optional debug toolkit, history, help). */
export function workspaceSidebarFooterItems(includeDebug: boolean): readonly TxSidebarItem[] {
  const items: TxSidebarItem[] = [];

  if (includeDebug) {
    items.push(DEBUG_ITEM);
  }

  items.push(USER_ITEMS.history, HELP_ITEM);

  return items;
}

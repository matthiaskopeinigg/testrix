/**
 * Canonical left-rail sidebar item IDs, labels, and settings normalizers.
 */

export const WORKSPACE_SIDEBAR_USER_ITEM_IDS = [
  'collections',
  'environments',
  'testing',
  'data',
  'development',
  'history',
] as const;

export type WorkspaceSidebarUserItemId = (typeof WORKSPACE_SIDEBAR_USER_ITEM_IDS)[number];

export const DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER: readonly WorkspaceSidebarUserItemId[] =
  WORKSPACE_SIDEBAR_USER_ITEM_IDS;

export const WORKSPACE_SIDEBAR_USER_ITEM_LABELS: Record<WorkspaceSidebarUserItemId, string> = {
  collections: 'Collections',
  environments: 'Environments',
  testing: 'Testing',
  data: 'Database',
  development: 'Development',
  history: 'History',
};

export const WORKSPACE_SIDEBAR_USER_ITEM_ICONS: Record<WorkspaceSidebarUserItemId, string> = {
  collections: 'folder',
  environments: 'globe',
  testing: 'testing',
  data: 'database',
  development: 'development',
  history: 'clock',
};

export const WORKSPACE_SIDEBAR_FOOTER_PINNED_IDS = ['debug', 'help'] as const;

export type WorkspaceSidebarFooterPinnedId = (typeof WORKSPACE_SIDEBAR_FOOTER_PINNED_IDS)[number];

export const WORKSPACE_SIDEBAR_FOOTER_LABELS: Record<WorkspaceSidebarFooterPinnedId, string> = {
  debug: 'Debug',
  help: 'Help',
};

export interface WorkspaceSidebarRailIds {
  readonly main: readonly WorkspaceSidebarUserItemId[];
  readonly footer: readonly WorkspaceSidebarFooterPinnedId[];
}

/**
 * Returns true when `value` is a user-configurable sidebar rail item id.
 */
export function isWorkspaceSidebarUserItemId(value: unknown): value is WorkspaceSidebarUserItemId {
  return (
    typeof value === 'string' &&
    (WORKSPACE_SIDEBAR_USER_ITEM_IDS as readonly string[]).includes(value)
  );
}

/**
 * Drops unknown ids, de-duplicates, and appends any missing ids in default order.
 */
export function normalizeSidebarItemOrder(raw: unknown): WorkspaceSidebarUserItemId[] {
  const seen = new Set<WorkspaceSidebarUserItemId>();
  const out: WorkspaceSidebarUserItemId[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isWorkspaceSidebarUserItemId(entry) || seen.has(entry)) {
        continue;
      }
      seen.add(entry);
      out.push(entry);
    }
  }
  for (const id of WORKSPACE_SIDEBAR_USER_ITEM_IDS) {
    if (!seen.has(id)) {
      out.push(id);
    }
  }
  return out;
}

/**
 * Drops unknown ids and de-duplicates hidden sidebar items.
 */
export function normalizeHiddenSidebarItems(raw: unknown): WorkspaceSidebarUserItemId[] {
  const seen = new Set<WorkspaceSidebarUserItemId>();
  const out: WorkspaceSidebarUserItemId[] = [];
  if (!Array.isArray(raw)) {
    return out;
  }
  for (const entry of raw) {
    if (!isWorkspaceSidebarUserItemId(entry) || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * Builds the visible main-rail and footer ids from persisted order/hidden lists.
 */
export function resolveWorkspaceSidebarRail(
  order: readonly string[],
  hidden: readonly string[],
  options: { readonly includeDebug: boolean },
): WorkspaceSidebarRailIds {
  const hiddenSet = new Set(normalizeHiddenSidebarItems(hidden));
  const main = normalizeSidebarItemOrder(order).filter((id) => !hiddenSet.has(id));
  const footer: WorkspaceSidebarFooterPinnedId[] = [];
  if (options.includeDebug) {
    footer.push('debug');
  }
  footer.push('help');
  return { main, footer };
}

/**
 * Moves `id` up (`-1`) or down (`+1`) in a normalized order list.
 */
export function moveWorkspaceSidebarItem(
  order: readonly WorkspaceSidebarUserItemId[],
  id: WorkspaceSidebarUserItemId,
  delta: -1 | 1,
): WorkspaceSidebarUserItemId[] {
  const next = normalizeSidebarItemOrder(order);
  const index = next.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= next.length) {
    return next;
  }
  const copy = [...next];
  const [item] = copy.splice(index, 1);
  copy.splice(target, 0, item);
  return copy;
}

/**
 * Adds or removes `id` from the hidden list while preserving canonical id order.
 */
export function toggleHiddenSidebarItem(
  hidden: readonly WorkspaceSidebarUserItemId[],
  id: WorkspaceSidebarUserItemId,
  visible: boolean,
): WorkspaceSidebarUserItemId[] {
  const set = new Set(normalizeHiddenSidebarItems(hidden));
  if (visible) {
    set.delete(id);
  } else {
    set.add(id);
  }
  return WORKSPACE_SIDEBAR_USER_ITEM_IDS.filter((item) => set.has(item));
}

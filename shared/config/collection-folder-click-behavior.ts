/** Single-click behavior for collection folder rows in the sidebar tree. */
export const COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS = [
  'expandCollapseAndOpenTab',
  'expandCollapse',
  'openTab',
] as const;

export type CollectionFolderClickBehavior = (typeof COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS)[number];

export const DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR: CollectionFolderClickBehavior =
  'expandCollapseAndOpenTab';

/** Legacy persisted values mapped to {@link CollectionFolderClickBehavior}. */
const LEGACY_FOLDER_CLICK_BEHAVIOR: Readonly<Record<string, CollectionFolderClickBehavior>> = {
  open: 'openTab',
  expandOnly: 'expandCollapse',
  toggle: 'expandCollapse',
  openAndExpand: 'expandCollapseAndOpenTab',
};

/** Coerces persisted settings (including legacy ids) to a supported behavior. */
export function coerceCollectionFolderClickBehavior(
  raw: unknown,
): CollectionFolderClickBehavior {
  if (typeof raw === 'string' && LEGACY_FOLDER_CLICK_BEHAVIOR[raw]) {
    return LEGACY_FOLDER_CLICK_BEHAVIOR[raw];
  }
  if (
    typeof raw === 'string' &&
    (COLLECTION_FOLDER_CLICK_BEHAVIOR_IDS as readonly string[]).includes(raw)
  ) {
    return raw as CollectionFolderClickBehavior;
  }
  return DEFAULT_COLLECTION_FOLDER_CLICK_BEHAVIOR;
}

/** User-facing label for settings and documentation. */
export function collectionFolderClickBehaviorLabel(id: CollectionFolderClickBehavior): string {
  switch (id) {
    case 'expandCollapseAndOpenTab':
      return 'Expand/Collapse and open Tab';
    case 'expandCollapse':
      return 'Expand/Collapse';
    case 'openTab':
      return 'Open Tab';
    default:
      return id;
  }
}

export interface CollectionFolderClickAction {
  readonly openTab: boolean;
  /** When set, updates folder expanded state; when omitted, leaves expansion unchanged. */
  readonly setExpanded?: boolean;
}

/**
 * Resolves folder row click handling from the configured behavior and current expansion.
 */
export function resolveCollectionFolderClickAction(
  behavior: CollectionFolderClickBehavior,
  isExpanded: boolean,
): CollectionFolderClickAction {
  switch (behavior) {
    case 'openTab':
      return { openTab: true };
    case 'expandCollapse':
      return { openTab: false, setExpanded: !isExpanded };
    case 'expandCollapseAndOpenTab':
      return { openTab: true, setExpanded: !isExpanded };
    default:
      return { openTab: true };
  }
}

import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  REGRESSION_SIDEBAR_FILTER_IDS,
  REGRESSION_SIDEBAR_SORT_BY_IDS,
  type RegressionSidebarFilter,
  type RegressionSidebarSortBy,
} from '@shared/config';

/** Filter menu entries for the regression sidebar toolbar. */
export function buildRegressionFilterMenuItems(
  kindFilter: RegressionSidebarFilter,
  tagFilter: readonly string[],
  allTags: readonly string[],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = REGRESSION_SIDEBAR_FILTER_IDS.map((id) =>
    kindFilterOption(id, kindFilter),
  );

  if (allTags.length > 0) {
    items.push({ id: 'sep-tags', label: '', separator: true });
    items.push({
      id: 'label-tags',
      label: 'Tags',
      icon: 'tag',
      disabled: true,
    });
    for (const tag of allTags) {
      items.push({
        id: `tag:${tag}`,
        label: tag,
        icon: 'tag',
        selected: tagFilter.some((active) => active.toLowerCase() === tag.toLowerCase()),
      });
    }
  }

  return items;
}

/** Sort menu entries for the regression sidebar toolbar. */
export function buildRegressionSortMenuItems(
  active: RegressionSidebarSortBy,
): TxContextMenuItem[] {
  return REGRESSION_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

/** Returns true when `actionId` is a regression kind filter id. */
export function isRegressionKindFilterAction(
  actionId: string,
): actionId is RegressionSidebarFilter {
  return (REGRESSION_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

/** Returns true when `actionId` is a regression sort id. */
export function isRegressionSortAction(actionId: string): actionId is RegressionSidebarSortBy {
  return (REGRESSION_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: RegressionSidebarFilter,
  active: RegressionSidebarFilter,
): TxContextMenuItem {
  const labels: Record<
    RegressionSidebarFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All items', icon: 'layers' },
    folders: { label: 'Folders only', icon: 'folder' },
    regressions: { label: 'Regressions only', icon: 'target' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: RegressionSidebarSortBy, active: RegressionSidebarSortBy): TxContextMenuItem {
  const labels: Record<RegressionSidebarSortBy, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> =
    {
      saved: { label: 'Saved order', icon: 'list' },
      'name-asc': { label: 'Name (A–Z)', icon: 'tag' },
      'name-desc': { label: 'Name (Z–A)', icon: 'tag' },
      'date-new': { label: 'Date modified (newest)', icon: 'clock' },
      'date-old': { label: 'Date modified (oldest)', icon: 'clock' },
    };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

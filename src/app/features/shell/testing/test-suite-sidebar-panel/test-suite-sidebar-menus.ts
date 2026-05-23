import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import {
  TEST_SUITE_SIDEBAR_FILTER_IDS,
  TEST_SUITE_SIDEBAR_SORT_BY_IDS,
  type TestSuiteSidebarFilter,
  type TestSuiteSidebarSortBy,
} from '@shared/config';

/** Filter menu entries for the test suite sidebar toolbar. */
export function buildTestSuiteFilterMenuItems(
  kindFilter: TestSuiteSidebarFilter,
  tagFilter: readonly string[],
  allTags: readonly string[],
): TxContextMenuItem[] {
  const items: TxContextMenuItem[] = TEST_SUITE_SIDEBAR_FILTER_IDS.map((id) =>
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

/** Sort menu entries for the test suite sidebar toolbar. */
export function buildTestSuiteSortMenuItems(active: TestSuiteSidebarSortBy): TxContextMenuItem[] {
  return TEST_SUITE_SIDEBAR_SORT_BY_IDS.map((id) => sortOption(id, active));
}

/** Returns true when `actionId` is a test suite kind filter id. */
export function isTestSuiteKindFilterAction(actionId: string): actionId is TestSuiteSidebarFilter {
  return (TEST_SUITE_SIDEBAR_FILTER_IDS as readonly string[]).includes(actionId);
}

/** Returns true when `actionId` is a test suite sort id. */
export function isTestSuiteSortAction(actionId: string): actionId is TestSuiteSidebarSortBy {
  return (TEST_SUITE_SIDEBAR_SORT_BY_IDS as readonly string[]).includes(actionId);
}

function kindFilterOption(
  id: TestSuiteSidebarFilter,
  active: TestSuiteSidebarFilter,
): TxContextMenuItem {
  const labels: Record<
    TestSuiteSidebarFilter,
    { readonly label: string; readonly icon: TxContextMenuItem['icon'] }
  > = {
    all: { label: 'All items', icon: 'layers' },
    folders: { label: 'Folders only', icon: 'folder' },
    flows: { label: 'Flows only', icon: 'play' },
  };
  const meta = labels[id];
  return { id, label: meta.label, icon: meta.icon, selected: active === id };
}

function sortOption(id: TestSuiteSidebarSortBy, active: TestSuiteSidebarSortBy): TxContextMenuItem {
  const labels: Record<TestSuiteSidebarSortBy, { readonly label: string; readonly icon: TxContextMenuItem['icon'] }> =
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

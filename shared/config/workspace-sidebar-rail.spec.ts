import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER,
  moveWorkspaceSidebarItem,
  normalizeHiddenSidebarItems,
  normalizeSidebarItemOrder,
  resolveWorkspaceSidebarRail,
  toggleHiddenSidebarItem,
} from './workspace-sidebar-rail';

describe('workspace-sidebar-rail', () => {
  it('fills missing ids in default order', () => {
    expect(normalizeSidebarItemOrder(['testing', 'bogus', 'testing'])).toEqual([
      'testing',
      'collections',
      'environments',
      'data',
      'development',
      'history',
    ]);
  });

  it('returns the default order for non-arrays', () => {
    expect(normalizeSidebarItemOrder(undefined)).toEqual([...DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER]);
  });

  it('drops unknown hidden ids', () => {
    expect(normalizeHiddenSidebarItems(['development', 'nope', 'development'])).toEqual([
      'development',
    ]);
  });

  it('omits hidden items from the main rail and pins Help in the footer', () => {
    const rail = resolveWorkspaceSidebarRail(
      ['history', 'collections'],
      ['development', 'data'],
      { includeDebug: false },
    );
    expect(rail.main).toEqual(['history', 'collections', 'environments', 'testing']);
    expect(rail.footer).toEqual(['help']);
  });

  it('inserts Debug above Help when the toolkit is available', () => {
    const rail = resolveWorkspaceSidebarRail([], [], { includeDebug: true });
    expect(rail.footer).toEqual(['debug', 'help']);
  });

  it('moves an item up and down without wrapping', () => {
    const order = [...DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER];
    expect(moveWorkspaceSidebarItem(order, 'collections', -1)).toEqual(order);
    expect(moveWorkspaceSidebarItem(order, 'collections', 1)[0]).toBe('environments');
    expect(moveWorkspaceSidebarItem(order, 'history', 1)).toEqual(order);
  });

  it('toggles hidden items', () => {
    expect(toggleHiddenSidebarItem([], 'development', false)).toEqual(['development']);
    expect(toggleHiddenSidebarItem(['development'], 'development', true)).toEqual([]);
  });
});

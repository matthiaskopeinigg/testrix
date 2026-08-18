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
      'data',
      'environments',
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

  it('omits hidden items from the main rail and pins History above Help', () => {
    const rail = resolveWorkspaceSidebarRail(
      ['history', 'collections'],
      ['development', 'data'],
      { includeDebug: false },
    );
    expect(rail.main).toEqual(['collections', 'testing', 'environments']);
    expect(rail.footer).toEqual(['history', 'help']);
  });

  it('inserts Debug above History and Help when the toolkit is available', () => {
    const rail = resolveWorkspaceSidebarRail([], [], { includeDebug: true });
    expect(rail.footer).toEqual(['debug', 'history', 'help']);
  });

  it('hides History from the footer when it is hidden', () => {
    const rail = resolveWorkspaceSidebarRail([], ['history'], { includeDebug: false });
    expect(rail.main.includes('history')).toBe(false);
    expect(rail.footer).toEqual(['help']);
  });

  it('moves an item up and down without wrapping', () => {
    const order = [...DEFAULT_WORKSPACE_SIDEBAR_ITEM_ORDER];
    expect(moveWorkspaceSidebarItem(order, 'collections', -1)).toEqual(order);
    expect(moveWorkspaceSidebarItem(order, 'collections', 1)[0]).toBe('testing');
    expect(moveWorkspaceSidebarItem(order, 'history', -1)).toEqual(order);
  });

  it('toggles hidden items', () => {
    expect(toggleHiddenSidebarItem([], 'development', false)).toEqual(['development']);
    expect(toggleHiddenSidebarItem(['development'], 'development', true)).toEqual([]);
  });
});

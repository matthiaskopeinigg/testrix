import { describe, expect, it } from 'vitest';

import { buildCollectionListFilterMenuItems } from './collection-list-sidebar-menus';

describe('buildCollectionListFilterMenuItems', () => {
  it('includes HTTP method options when requests filter is active', () => {
    const items = buildCollectionListFilterMenuItems('requests', [], [], ['GET']);
    expect(items.some((item) => item.id === 'method:POST')).toBe(true);
    expect(items.find((item) => item.id === 'method:GET')?.selected).toBe(true);
  });

  it('omits HTTP method section for non-request kind filters', () => {
    const items = buildCollectionListFilterMenuItems('folders', [], [], []);
    expect(items.some((item) => item.id?.startsWith('method:'))).toBe(false);
  });

  it('includes tag toggles when tags exist in the collection', () => {
    const items = buildCollectionListFilterMenuItems('all', ['api'], ['api', 'auth'], []);
    const tagItem = items.find((item) => item.id === 'tag:api');
    expect(tagItem?.selected).toBe(true);
    expect(items.find((item) => item.id === 'tag:auth')?.selected).toBe(false);
  });
});

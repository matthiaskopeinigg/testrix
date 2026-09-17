import { describe, expect, it } from 'vitest';

import type { DatabaseNavNode } from './database-nav';
import {
  catalogSearchReveals,
  filterCatalogChildren,
  filterCatalogSearch,
  pageCatalogChildren,
} from './database-catalog-page';

function leaf(name: string, kind: DatabaseNavNode['kind'] = 'table'): DatabaseNavNode {
  return { id: name, kind, name, section: 'connections' };
}

describe('pageCatalogChildren', () => {
  it('returns the first page and remaining count', () => {
    const children = ['a', 'b', 'c', 'd'].map((name) => leaf(name));
    expect(pageCatalogChildren(children, 2)).toEqual({
      visible: [children[0], children[1]],
      total: 4,
      remaining: 2,
    });
  });
});

describe('filterCatalogChildren', () => {
  it('matches name or detail', () => {
    const children = [
      leaf('orders'),
      { ...leaf('items'), detail: 'order_items_fkey' },
    ];
    expect(filterCatalogChildren(children, 'order').map((node) => node.name)).toEqual(['orders', 'items']);
  });
});

describe('filterCatalogSearch', () => {
  it('keeps the path to a matching table', () => {
    const tree: DatabaseNavNode[] = [
      {
        id: 'c1',
        kind: 'connection',
        name: 'PM',
        section: 'connections',
        children: [
          {
            id: 'schema',
            kind: 'schema',
            name: 'public',
            section: 'connections',
            children: [
              {
                id: 'tables',
                kind: 'group',
                name: 'tables',
                section: 'connections',
                children: [leaf('orders'), leaf('customers')],
              },
            ],
          },
        ],
      },
    ];
    const next = filterCatalogSearch(tree, 'order');
    expect(next[0]?.name).toBe('PM');
    expect(next[0]?.children?.[0]?.children?.[0]?.children?.map((node) => node.name)).toEqual(['orders']);
  });

  it('keeps a matching connection unfiltered', () => {
    const tree: DatabaseNavNode[] = [
      {
        id: 'c1',
        kind: 'connection',
        name: 'PM',
        section: 'connections',
        children: [leaf('customers'), leaf('orders')],
      },
    ];
    expect(filterCatalogSearch(tree, 'pm')[0]?.children?.map((node) => node.name)).toEqual(['customers', 'orders']);
  });
});

describe('catalogSearchReveals', () => {
  it('opens ancestors of a match, not the match itself', () => {
    const parent: DatabaseNavNode = {
      id: 'tables',
      kind: 'group',
      name: 'tables',
      section: 'connections',
      children: [leaf('orders')],
    };
    expect(catalogSearchReveals(parent, 'order')).toBe(true);
    expect(catalogSearchReveals(leaf('orders'), 'order')).toBe(false);
  });
});

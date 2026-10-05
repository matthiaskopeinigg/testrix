import {
  DEFAULT_COLLECTION_FILTERS,
  DEFAULT_FOLDER_AUTH,
  parseCollectionFolderConfig,
  parseCollectionRequestConfig,
  parseCollectionWebSocketConfig,
  type CollectionTree,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { planHttpSend } from '../workbench/request/http-send';
import { planWebsocketConnect } from '../workbench/request/websocket-send';
import {
  canPlaceAtIndex,
  ensureFoldersFirst,
  filterCollectionTree,
} from './collections.store';

const ISO = '2026-01-01T00:00:00.000Z';

/**
 * End-to-end style journeys for Collections without a browser driver.
 * Walks sidebar tree rules → folder inherit → request Send → websocket Connect.
 */
describe('Collections e2e journeys', () => {
  it('creates a nested folder with HTTP + WebSocket and plans both transports', () => {
    const tree: CollectionTree = ensureFoldersFirst([
      {
        kind: 'folder',
        id: 'shop',
        name: 'Shop API',
        modifiedAt: ISO,
        config: parseCollectionFolderConfig({
          variables: [{ id: 'v1', enabled: true, key: 'host', value: 'api.shop.test' }],
          headers: [{ id: 'h1', enabled: true, key: 'X-App', value: 'testrix' }],
          auth: { type: 'bearer', token: 'shop-token' },
          docs: '# Shop\nShared auth for storefront APIs.',
        }),
        children: [
          {
            kind: 'http',
            id: 'list-products',
            name: 'List products',
            modifiedAt: ISO,
            method: 'GET',
            status: null,
            config: parseCollectionRequestConfig({
              url: 'https://{{host}}/products',
              docs: 'Returns the catalog page.',
            }),
          },
          {
            kind: 'websocket',
            id: 'stock-feed',
            name: 'Stock feed',
            modifiedAt: ISO,
            config: parseCollectionWebSocketConfig({
              url: 'wss://{{host}}/stock',
              docs: 'Live inventory updates.',
            }),
          },
        ],
      },
    ]);

    expect(tree.map((node) => node.id)).toEqual(['shop']);
    expect(tree[0]?.kind === 'folder' && tree[0].children.map((node) => node.kind)).toEqual([
      'http',
      'websocket',
    ]);

    const visible = filterCollectionTree(tree, DEFAULT_COLLECTION_FILTERS, 'stock');
    expect(visible[0]?.kind === 'folder' && visible[0].children.map((node) => node.id)).toEqual(['stock-feed']);

    const httpPlan = planHttpSend({
      tree,
      nodeId: 'list-products',
      method: 'GET',
      url: 'https://{{host}}/products',
      params: [],
      headers: [],
      body: '',
      authMode: 'inherit',
      requestAuth: DEFAULT_FOLDER_AUTH,
      envVars: {},
    });
    expect(httpPlan.payload.url).toBe('https://api.shop.test/products');
    expect(httpPlan.payload.auth.token).toBe('shop-token');
    expect(httpPlan.payload.headers).toEqual(expect.arrayContaining([{ key: 'X-App', value: 'testrix' }]));

    const wsPlan = planWebsocketConnect({
      tree,
      nodeId: 'stock-feed',
      connectionId: 'tab-stock',
      url: 'wss://{{host}}/stock',
      params: [],
      headers: [],
      protocols: '',
      authMode: 'inherit',
      requestAuth: DEFAULT_FOLDER_AUTH,
      envVars: {},
    });
    expect(wsPlan.payload.url).toBe('wss://api.shop.test/stock');
    expect(wsPlan.payload.headers).toEqual(expect.arrayContaining([{ key: 'X-App', value: 'testrix' }]));
  });

  it('enforces folders-first drop rules while reordering a request under a folder', () => {
    const siblings = [
      { kind: 'folder' as const, id: 'a', name: 'A', modifiedAt: ISO, children: [] },
      { kind: 'http' as const, id: 'r1', name: 'R1', modifiedAt: ISO, method: 'GET' as const, status: null },
      { kind: 'websocket' as const, id: 'w1', name: 'W1', modifiedAt: ISO, status: null },
    ];
    expect(canPlaceAtIndex(siblings, siblings[1]!, 0)).toBe(false);
    expect(canPlaceAtIndex(siblings, siblings[1]!, 1)).toBe(true);
    expect(canPlaceAtIndex(siblings, siblings[0]!, 0)).toBe(true);
  });
});

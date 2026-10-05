import {
  DEFAULT_COLLECTION_FILTERS,
  REQUEST_TAB_SECTIONS,
  WEBSOCKET_TAB_SECTIONS,
  folderTabSectionSchema,
  parseCollectionFolderConfig,
  parseCollectionRequestConfig,
  parseCollectionWebSocketConfig,
  requestSectionSlideDir,
  websocketTabSlideDir,
  type CollectionNode,
  type CollectionTree,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { canPlaceAtIndex, ensureFoldersFirst, filterCollectionTree } from './collections.store';
import { docsModeSlideDir } from './docs-mode-slide';
import { planHttpSend } from '../workbench/request/http-send';
import { planWebsocketConnect } from '../workbench/request/websocket-send';

const ISO = '2026-01-01T00:00:00.000Z';

function folder(id: string, children: CollectionTree = [], name = id): CollectionNode {
  return { kind: 'folder', id, name, modifiedAt: ISO, children };
}

function http(id: string, name = id): CollectionNode {
  return { kind: 'http', id, name, modifiedAt: ISO, method: 'GET', status: null };
}

function websocket(id: string, name = id): CollectionNode {
  return { kind: 'websocket', id, name, modifiedAt: ISO };
}

describe('CollectionsSidebarComponent (tree behavior)', () => {
  it('keeps folders ahead of HTTP and WebSocket leaves', () => {
    const sorted = ensureFoldersFirst([http('r1'), folder('f1', [websocket('ws1')]), websocket('ws2')]);
    expect(sorted.map((node) => node.id)).toEqual(['f1', 'r1', 'ws2']);
    expect(sorted[0]?.kind === 'folder' && sorted[0].children.map((node) => node.id)).toEqual(['ws1']);
  });

  it('filters WebSocket leaves by kind and search', () => {
    const tree = [folder('api', [http('ping'), websocket('events', 'Live events')])];
    const byKind = filterCollectionTree(tree, { ...DEFAULT_COLLECTION_FILTERS, kinds: ['websocket'] }, '');
    expect(byKind).toHaveLength(1);
    expect(byKind[0]?.kind === 'folder' && byKind[0].children.map((node) => node.id)).toEqual(['events']);

    const bySearch = filterCollectionTree(tree, DEFAULT_COLLECTION_FILTERS, 'live');
    expect(bySearch[0]?.kind === 'folder' && bySearch[0].children.map((node) => node.id)).toEqual(['events']);
  });

  it('blocks dropping a request above the folder band', () => {
    const siblings = [folder('f1'), folder('f2'), http('r1')];
    expect(canPlaceAtIndex(siblings, http('drag'), 0)).toBe(false);
    expect(canPlaceAtIndex(siblings, http('drag'), 2)).toBe(true);
    expect(canPlaceAtIndex(siblings, folder('drag-folder'), 1)).toBe(true);
    expect(canPlaceAtIndex(siblings, folder('drag-folder'), 3)).toBe(false);
  });
});

describe('CollectionFolderEditorComponent (folder tab)', () => {
  it('exposes the folder section set used by the tab strip', () => {
    expect(folderTabSectionSchema.options).toEqual([
      'overview',
      'variables',
      'headers',
      'auth',
      'scripts',
      'settings',
      'docs',
    ]);
  });

  it('parses folder docs and inherits empty markdown by default', () => {
    const empty = parseCollectionFolderConfig({});
    expect(empty.docs).toBe('');
    const withDocs = parseCollectionFolderConfig({ docs: '# Auth\n\nBearer tokens live here.' });
    expect(withDocs.docs).toContain('Bearer tokens');
  });

  it('slides Write / Split / Preview like the request Docs tab', () => {
    expect(docsModeSlideDir('write', 'preview')).toBe('right');
    expect(docsModeSlideDir('preview', 'write')).toBe('left');
    expect(docsModeSlideDir('split', 'write')).toBe('left');
  });
});

describe('RequestEditorComponent (request tab)', () => {
  it('lists Docs after Settings in the section strip', () => {
    expect(REQUEST_TAB_SECTIONS).toContain('docs');
    expect(REQUEST_TAB_SECTIONS.indexOf('docs')).toBeGreaterThan(REQUEST_TAB_SECTIONS.indexOf('settings'));
  });

  it('slides sections toward Docs and back', () => {
    expect(requestSectionSlideDir('overview', 'docs')).toBe('right');
    expect(requestSectionSlideDir('docs', 'headers')).toBe('left');
  });

  it('plans Send with inherited folder auth for an open request tab', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'folder',
          id: 'api',
          name: 'API',
          modifiedAt: ISO,
          config: parseCollectionFolderConfig({
            auth: { type: 'bearer', token: 'folder-token' },
            headers: [{ id: 'h1', enabled: true, key: 'X-Folder', value: '1' }],
          }),
          children: [http('ping')],
        },
      ],
      nodeId: 'ping',
      method: 'GET',
      url: 'api.local/ping',
      params: [],
      headers: [],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
    });
    expect(plan.payload.url).toBe('http://api.local/ping');
    expect(plan.payload.auth.type).toBe('bearer');
    expect(plan.payload.headers).toEqual(expect.arrayContaining([{ key: 'X-Folder', value: '1' }]));
  });

  it('keeps request docs on the persisted config', () => {
    const config = parseCollectionRequestConfig({ docs: '## Notes\nCall after login.' });
    expect(config.docs).toBe('## Notes\nCall after login.');
  });
});

describe('WebsocketEditorComponent (websocket tab)', () => {
  it('lists Docs in the WebSocket section strip', () => {
    expect(WEBSOCKET_TAB_SECTIONS).toEqual(['messages', 'params', 'headers', 'auth', 'settings', 'docs']);
  });

  it('slides between Messages and Docs', () => {
    expect(websocketTabSlideDir('messages', 'docs')).toBe('right');
    expect(websocketTabSlideDir('docs', 'params')).toBe('left');
  });

  it('plans Connect with scheme, query, and inherited folder headers', () => {
    const plan = planWebsocketConnect({
      tree: [
        {
          kind: 'folder',
          id: 'realtime',
          name: 'Realtime',
          modifiedAt: ISO,
          config: parseCollectionFolderConfig({
            headers: [{ id: 'h1', enabled: true, key: 'X-Tenant', value: 'acme' }],
            auth: { type: 'bearer', token: 'ws-token' },
          }),
          children: [websocket('events')],
        },
      ],
      nodeId: 'events',
      connectionId: 'tab-ws',
      url: 'localhost:9001/stream',
      params: [{ id: 'q', enabled: true, key: 'room', value: 'ops', description: '' }],
      headers: [],
      protocols: 'json',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
    });
    expect(plan.payload.url).toBe('ws://localhost:9001/stream?room=ops');
    expect(plan.payload.headers).toEqual(expect.arrayContaining([{ key: 'X-Tenant', value: 'acme' }]));
    expect(plan.payload.protocols).toEqual(['json']);
  });

  it('persists socket docs on the websocket config', () => {
    const config = parseCollectionWebSocketConfig({ docs: 'Subscribe before publishing.' });
    expect(config.docs).toBe('Subscribe before publishing.');
  });
});

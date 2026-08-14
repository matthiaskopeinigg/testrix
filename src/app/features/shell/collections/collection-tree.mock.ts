import {
  createDefaultCollectionFolderSettings,
  createDefaultCollectionRequestSettings,
  createDefaultCollectionWebsocketSettings,
} from '@shared/config';

import { iconForCollectionKind } from './collection-tree.icons';
import type { CollectionTreeNode } from './collection-tree.types';

const DEFAULT_FOLDER_SETTINGS = createDefaultCollectionFolderSettings();
const DEFAULT_REQUEST_SETTINGS = createDefaultCollectionRequestSettings();
const DEFAULT_WEBSOCKET_SETTINGS = createDefaultCollectionWebsocketSettings();

const EMPTY_FOLDER: CollectionTreeNode = {
  id: 'folder-empty',
  label: 'Empty',
  kind: 'folder',
  icon: iconForCollectionKind('folder'),
  order: 30,
  data: { kind: 'folder', settings: DEFAULT_FOLDER_SETTINGS },
  children: [],
};

/** In-memory sample tree for the Collections sidebar (v1). */
export const COLLECTION_TREE_MOCK: CollectionTreeNode[] = [
  {
    id: 'folder-auth',
    label: 'Auth',
    kind: 'folder',
    icon: iconForCollectionKind('folder'),
    order: 0,
    data: { kind: 'folder', settings: DEFAULT_FOLDER_SETTINGS },
    children: [
      {
        id: 'req-login',
        label: 'POST /login',
        kind: 'request',
        icon: iconForCollectionKind('request'),
        order: 0,
        data: {
          kind: 'request',
          method: 'POST',
          url: '/login',
          requestSettings: DEFAULT_REQUEST_SETTINGS,
        },
      },
      {
        id: 'req-refresh',
        label: 'POST /refresh',
        kind: 'request',
        icon: iconForCollectionKind('request'),
        order: 10,
        data: {
          kind: 'request',
          method: 'POST',
          url: '/refresh',
          requestSettings: DEFAULT_REQUEST_SETTINGS,
        },
      },
      {
        id: 'ws-auth-status',
        label: 'WS /auth/status',
        kind: 'websocket',
        icon: iconForCollectionKind('websocket'),
        order: 20,
        data: {
          kind: 'websocket',
          wsPath: 'ws://localhost/auth/status',
          websocketSettings: DEFAULT_WEBSOCKET_SETTINGS,
        },
      },
    ],
  },
  {
    id: 'folder-users',
    label: 'Users',
    kind: 'folder',
    icon: iconForCollectionKind('folder'),
    order: 10,
    data: { kind: 'folder', settings: DEFAULT_FOLDER_SETTINGS },
    children: [
      {
        id: 'req-list-users',
        label: 'GET /users',
        kind: 'request',
        icon: iconForCollectionKind('request'),
        order: 0,
        data: {
          kind: 'request',
          method: 'GET',
          url: '/users',
          requestSettings: DEFAULT_REQUEST_SETTINGS,
        },
      },
      {
        id: 'req-create-user',
        label: 'POST /users',
        kind: 'request',
        icon: iconForCollectionKind('request'),
        order: 10,
        data: {
          kind: 'request',
          method: 'POST',
          url: '/users',
          requestSettings: DEFAULT_REQUEST_SETTINGS,
        },
      },
    ],
  },
  {
    id: 'folder-realtime',
    label: 'Realtime',
    kind: 'folder',
    icon: iconForCollectionKind('folder'),
    order: 20,
    data: { kind: 'folder', settings: DEFAULT_FOLDER_SETTINGS },
    children: [
      {
        id: 'ws-events',
        label: 'WS /events',
        kind: 'websocket',
        icon: iconForCollectionKind('websocket'),
        order: 0,
        data: {
          kind: 'websocket',
          wsPath: 'ws://localhost/events',
          websocketSettings: DEFAULT_WEBSOCKET_SETTINGS,
        },
      },
      {
        id: 'ws-notifications',
        label: 'WS /notifications',
        kind: 'websocket',
        icon: iconForCollectionKind('websocket'),
        order: 10,
        data: {
          kind: 'websocket',
          wsPath: 'ws://localhost/notifications',
          websocketSettings: DEFAULT_WEBSOCKET_SETTINGS,
        },
      },
    ],
  },
  EMPTY_FOLDER,
];

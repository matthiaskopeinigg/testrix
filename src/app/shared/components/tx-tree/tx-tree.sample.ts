import type { TxTreeNode } from './tx-tree.types';

/** Sample tree used by the Design System tree demo. */
export const TX_TREE_DEMO_NODES: readonly TxTreeNode[] = [
  {
    id: 'collections',
    label: 'Collections',
    icon: 'folder',
    kind: 'folder',
    order: 0,
    children: [
      {
        id: 'auth',
        label: 'Auth API',
        icon: 'folder',
        kind: 'folder',
        order: 0,
        children: [
          { id: 'login', label: 'POST /login', icon: 'api', kind: 'leaf', order: 0 },
          { id: 'refresh', label: 'POST /refresh', icon: 'api', kind: 'leaf', order: 10 },
        ],
      },
      {
        id: 'users',
        label: 'Users',
        icon: 'folder',
        kind: 'folder',
        order: 10,
        children: [
          { id: 'list-users', label: 'GET /users', icon: 'api', kind: 'leaf', order: 0 },
          { id: 'create-user', label: 'POST /users', icon: 'api', kind: 'leaf', order: 10 },
          { id: 'get-user', label: 'GET /users/:id', icon: 'api', kind: 'leaf', order: 20 },
          { id: 'patch-user', label: 'PATCH /users/:id', icon: 'api', kind: 'leaf', order: 30 },
        ],
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: 'folder',
        kind: 'folder',
        order: 20,
        children: [
          { id: 'list-invoices', label: 'GET /invoices', icon: 'api', kind: 'leaf', order: 0 },
          { id: 'create-invoice', label: 'POST /invoices', icon: 'api', kind: 'leaf', order: 10 },
        ],
      },
    ],
  },
  {
    id: 'environments',
    label: 'Environments',
    icon: 'globe',
    kind: 'folder',
    order: 10,
    children: [
      { id: 'env-local', label: 'Local', icon: 'tag', kind: 'leaf', order: 0 },
      { id: 'env-staging', label: 'Staging', icon: 'tag', kind: 'leaf', order: 10 },
      { id: 'env-prod', label: 'Production', icon: 'tag', kind: 'leaf', order: 20 },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: 'folder',
    kind: 'folder',
    order: 20,
    children: [
      {
        id: 'webhooks',
        label: 'Webhooks',
        icon: 'folder',
        kind: 'folder',
        order: 0,
        children: [
          { id: 'list-webhooks', label: 'GET /webhooks', icon: 'api', kind: 'leaf', order: 0 },
          { id: 'create-webhook', label: 'POST /webhooks', icon: 'api', kind: 'leaf', order: 10 },
          { id: 'ws-events', label: 'WS /events', icon: 'zap', kind: 'leaf', order: 20 },
        ],
      },
      { id: 'slack', label: 'Slack connector', icon: 'link', kind: 'leaf', order: 10 },
    ],
  },
];

/** Folder ids in {@link TX_TREE_DEMO_NODES} (expand-all for the design-system demo). */
export function collectTxTreeDemoFolderIds(nodes: readonly TxTreeNode[] = TX_TREE_DEMO_NODES): string[] {
  const ids: string[] = [];

  const walk = (list: readonly TxTreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'folder' || node.children?.length) {
        ids.push(node.id);
      }
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };

  walk(nodes);
  return ids;
}

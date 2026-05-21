import type { EnvironmentScopeNode } from '@shared/config';

/** Sample scope nodes for unit tests (not shipped as defaults). */
export const ENVIRONMENT_SCOPE_FIXTURE: EnvironmentScopeNode[] = [
  {
    id: 'folder-vars',
    kind: 'folder',
    label: 'Variables',
    order: 0,
    children: [
      {
        id: 'var-base-url',
        kind: 'variable',
        key: 'baseUrl',
        value: 'http://localhost:3000',
        order: 0,
      },
    ],
  },
  {
    id: 'var-api-token',
    kind: 'variable',
    key: 'apiToken',
    value: '',
    order: 10,
  },
];

import {
  DEFAULT_FOLDER_AUTH,
  createDefaultEnvironments,
  environmentVariableMap,
  insertEnvironmentNode,
  isEnvironmentFolder,
  parseEnvironmentsFile,
  type EnvironmentNode,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { planHttpSend } from '../workbench/request/http-send';

function variable(id: string, key: string, value: string, enabled = true): EnvironmentNode {
  return { kind: 'variable', id, key, value, enabled, secret: false, description: '' };
}

function folder(id: string, name: string, children: EnvironmentNode[] = []): EnvironmentNode {
  return { kind: 'folder', id, name, children, description: '', collapsed: false };
}

/**
 * End-to-end style journeys for Environments without a browser driver.
 * Walks seeded envs → nested vars → HTTP Send placeholder expansion.
 */
describe('Environments e2e journeys', () => {
  it('loads seeded environments and maps nested variables into an HTTP plan', () => {
    const file = parseEnvironmentsFile({
      schemaVersion: 1,
      items: createDefaultEnvironments(),
      activeId: 'env-local',
      orderIds: [],
    });
    expect(file.activeId).toBe('env-local');
    const local = file.items.find((item) => item.id === 'env-local');
    expect(local).toBeTruthy();

    const nested = insertEnvironmentNode(
      local?.variables ?? [],
      null,
      folder('shared', 'Shared', [variable('v-host', 'host', 'api.shop.test')]),
    );
    const withToken = insertEnvironmentNode(nested, 'shared', variable('v-token', 'token', 'env-token'));
    expect(withToken.some((node) => isEnvironmentFolder(node) && node.id === 'shared')).toBe(true);

    const envVars = environmentVariableMap(withToken);
    expect(envVars['host']).toBe('api.shop.test');
    expect(envVars['token']).toBe('env-token');

    const plan = planHttpSend({
      tree: [],
      nodeId: 'orphan',
      method: 'GET',
      url: 'https://{{host}}/health',
      params: [],
      headers: [{ id: 'h1', enabled: true, key: 'Authorization', value: 'Bearer {{token}}', description: '' }],
      body: '',
      authMode: 'none',
      requestAuth: DEFAULT_FOLDER_AUTH,
      envVars,
    });
    expect(plan.payload.url).toBe('https://api.shop.test/health');
    expect(plan.payload.headers).toEqual(
      expect.arrayContaining([{ key: 'Authorization', value: 'Bearer env-token' }]),
    );
  });

  it('ignores disabled secrets when building the active map', () => {
    const nodes: EnvironmentNode[] = [
      variable('v1', 'public', 'ok'),
      variable('v2', 'secretKey', 'hidden', false),
    ];
    expect(environmentVariableMap(nodes)).toEqual({ public: 'ok' });
  });
});

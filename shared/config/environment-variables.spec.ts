import { describe, expect, it } from 'vitest';

import {
  catalogForAllEnvironments,
  catalogForEnvironment,
  collectEnvironmentVariables,
  findEnvironmentVariableNodeId,
  findEnvironmentVariableNodeIdInProfiles,
  environmentVariablesToMap,
} from './environment-variables';
import { createDefaultEnvironments } from './defaults';

describe('environment-variables', () => {
  it('collects variables from nested folders', () => {
    const env = createDefaultEnvironments().environments[0]!;
    const withVars = {
      ...env,
      nodes: [
        {
          id: 'f1',
          kind: 'folder' as const,
          label: 'Group',
          children: [
            { id: 'v1', kind: 'variable' as const, key: 'apiKey', value: 'secret' },
          ],
        },
        { id: 'v2', kind: 'variable' as const, key: 'baseUrl', value: 'https://api.test' },
      ],
    };

    expect(collectEnvironmentVariables(withVars.nodes)).toEqual([
      { key: 'apiKey', value: 'secret' },
      { key: 'baseUrl', value: 'https://api.test' },
    ]);
  });

  it('builds catalog and map for autocomplete', () => {
    const entries = [{ key: 'token', value: 'abc' }];
    const catalog = catalogForEnvironment({
      id: 'e1',
      name: 'Dev',
      nodes: [{ id: 'v1', kind: 'variable', key: 'token', value: 'abc' }],
    });
    expect(catalog[0]?.insert).toBe('{{token}}');
    expect(environmentVariablesToMap(entries)).toEqual({ token: 'abc' });
  });

  it('merges catalog entries across profiles without duplicate keys', () => {
    const catalog = catalogForAllEnvironments([
      {
        id: 'e1',
        name: 'Dev',
        nodes: [{ id: 'v1', kind: 'variable', key: 'token', value: 'a' }],
      },
      {
        id: 'e2',
        name: 'Prod',
        nodes: [{ id: 'v2', kind: 'variable', key: 'token', value: 'b' }],
      },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe('env:token');
  });

  it('resolves variable node ids for opening workspace tabs', () => {
    const environments = [
      {
        id: 'e1',
        name: 'Dev',
        nodes: [{ id: 'node-1', kind: 'variable' as const, key: 'apiKey', value: '' }],
      },
    ];
    expect(findEnvironmentVariableNodeId(environments[0], 'apiKey')).toBe('node-1');
    expect(findEnvironmentVariableNodeIdInProfiles(environments, 'apiKey')).toBe('node-1');
    expect(findEnvironmentVariableNodeIdInProfiles(environments, 'missing')).toBeNull();
  });
});

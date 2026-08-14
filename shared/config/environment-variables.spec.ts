import { describe, expect, it } from 'vitest';

import {
  catalogForAllEnvironments,
  catalogForEnvironment,
  collectEnvironmentVariables,
  environmentVariablesToCatalog,
  findEnvironmentVariableNodeId,
  findEnvironmentVariableNodeIdInProfiles,
  environmentVariablesToMap,
  sanitizeEnvironmentFolderPathSegment,
} from './environment-variables';
import { createDefaultEnvironments } from './defaults';

describe('environment-variables', () => {
  const nestedEnv = {
    id: 'e1',
    name: 'Dev',
    nodes: [
      {
        id: 'f-url',
        kind: 'folder' as const,
        label: 'url',
        children: [
          { id: 'v-magenta', kind: 'variable' as const, key: 'magenta', value: '#f0f' },
        ],
      },
      {
        id: 'f-user',
        kind: 'folder' as const,
        label: 'user',
        children: [
          {
            id: 'f-b2c',
            kind: 'folder' as const,
            label: 'b2c',
            children: [
              { id: 'v-prepaid', kind: 'variable' as const, key: 'prepaid', value: 'yes' },
            ],
          },
        ],
      },
      { id: 'v2', kind: 'variable' as const, key: 'baseUrl', value: 'https://api.test' },
    ],
  };

  it('collects variables from nested folders with flat keys by default', () => {
    expect(collectEnvironmentVariables(nestedEnv.nodes)).toEqual([
      { key: 'magenta', value: '#f0f' },
      { key: 'prepaid', value: 'yes' },
      { key: 'baseUrl', value: 'https://api.test' },
    ]);
  });

  it('collects qualified keys when useFolderPathInKeys is enabled', () => {
    expect(
      collectEnvironmentVariables(nestedEnv.nodes, { useFolderPathInKeys: true }),
    ).toEqual([
      { key: 'url.magenta', value: '#f0f' },
      { key: 'user.b2c.prepaid', value: 'yes' },
      { key: 'baseUrl', value: 'https://api.test' },
    ]);
  });

  it('sanitizes folder labels for path segments', () => {
    expect(sanitizeEnvironmentFolderPathSegment('B2C Prepaid')).toBe('B2C_Prepaid');
    expect(sanitizeEnvironmentFolderPathSegment('   ')).toBe('folder');
  });

  it('builds catalog and map for autocomplete', () => {
    const entries = [{ key: 'token', value: 'abc' }];
    const catalog = catalogForEnvironment({
      id: 'e1',
      name: 'Dev',
      nodes: [{ id: 'v1', kind: 'variable', key: 'token', value: 'abc' }],
    });
    expect(catalog[0]?.insert).toBe('{{token}}');
    expect(catalog[0]?.detail).toBe('Dev');
    expect(catalog[0]?.detail).not.toContain('abc');
    expect(environmentVariablesToMap(entries)).toEqual({ token: 'abc' });
  });

  it('catalog detail never exposes variable values', () => {
    const catalog = environmentVariablesToCatalog(
      [{ key: 'password', value: 'super-secret-token' }],
      'production',
    );
    expect(catalog[0]?.detail).toBe('production');
    expect(catalog[0]?.detail).not.toContain('super-secret');
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

  it('resolves variable node ids for opening workspace tabs (flat keys)', () => {
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

  it('resolves qualified keys by folder path when path mode is enabled', () => {
    expect(
      findEnvironmentVariableNodeId(nestedEnv, 'url.magenta', { useFolderPathInKeys: true }),
    ).toBe('v-magenta');
    expect(
      findEnvironmentVariableNodeId(nestedEnv, 'user.b2c.prepaid', { useFolderPathInKeys: true }),
    ).toBe('v-prepaid');
    expect(
      findEnvironmentVariableNodeId(nestedEnv, 'prepaid', { useFolderPathInKeys: true }),
    ).toBe('v-prepaid');
  });

  it('collects variables from legacy default fixture shape', () => {
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
});

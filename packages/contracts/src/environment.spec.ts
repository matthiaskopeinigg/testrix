import { describe, expect, it } from 'vitest';

import { findEnabledEnvironmentVariableByKey, type EnvironmentNode } from './environment';

describe('findEnabledEnvironmentVariableByKey', () => {
  it('returns the last enabled match, including nested folders', () => {
    const nodes: EnvironmentNode[] = [
      {
        kind: 'variable',
        id: 'root-host',
        key: 'HOST',
        value: 'root',
        description: '',
        enabled: true,
        secret: false,
      },
      {
        kind: 'folder',
        id: 'folder',
        name: 'url',
        description: '',
        collapsed: true,
        children: [
          {
            kind: 'variable',
            id: 'nested-host',
            key: 'HOST',
            value: 'nested',
            description: '',
            enabled: true,
            secret: false,
          },
        ],
      },
    ];
    expect(findEnabledEnvironmentVariableByKey(nodes, 'host')?.id).toBe('nested-host');
  });

  it('skips disabled rows', () => {
    const nodes: EnvironmentNode[] = [
      {
        kind: 'variable',
        id: 'off',
        key: 'TOKEN',
        value: 'no',
        description: '',
        enabled: false,
        secret: false,
      },
    ];
    expect(findEnabledEnvironmentVariableByKey(nodes, 'TOKEN')).toBeNull();
  });
});

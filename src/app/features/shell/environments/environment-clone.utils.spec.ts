import { describe, expect, it } from 'vitest';

import {
  cloneEnvironmentDefinition,
  cloneEnvironmentScopeNodes,
  resolveClonedEnvironmentName,
} from './environment-clone.utils';

describe('environment-clone.utils', () => {
  it('assigns new ids to cloned scope nodes', () => {
    const cloned = cloneEnvironmentScopeNodes([
      {
        id: 'folder-1',
        kind: 'folder',
        label: 'Group',
        children: [{ id: 'var-1', kind: 'variable', key: 'apiKey', value: 'secret' }],
      },
    ]);

    const folder = cloned[0];
    expect(folder?.id).not.toBe('folder-1');
    expect(folder?.kind).toBe('folder');
    if (folder?.kind !== 'folder') {
      throw new Error('expected folder node');
    }
    expect(folder.children[0]?.id).not.toBe('var-1');
    expect(folder.children[0]).toMatchObject({ key: 'apiKey', value: 'secret' });
  });

  it('resolves unique clone names', () => {
    expect(resolveClonedEnvironmentName('Local', ['Staging'])).toBe('Local (copy)');
    expect(resolveClonedEnvironmentName('Local', ['Local (copy)'])).toBe('Local (copy 2)');
  });

  it('clones environment metadata and nodes', () => {
    const clone = cloneEnvironmentDefinition(
      {
        id: 'env-1',
        name: 'Local',
        description: 'Dev',
        order: 0,
        nodes: [{ id: 'var-1', kind: 'variable', key: 'baseUrl', value: 'http://localhost' }],
      },
      ['Staging'],
      'env-2',
      10,
    );

    expect(clone).toMatchObject({
      id: 'env-2',
      name: 'Local (copy)',
      description: 'Dev',
      order: 10,
    });
    expect(clone.nodes[0]?.id).not.toBe('var-1');
  });
});

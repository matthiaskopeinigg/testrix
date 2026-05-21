import { describe, expect, it } from 'vitest';

import { fromTreeNodes, toTreeNodes } from './environment-tree.adapter';
import { ENVIRONMENT_SCOPE_FIXTURE } from './environment-tree.fixture';

describe('environment-tree.adapter', () => {
  it('round-trips environment nodes through tree nodes', () => {
    const fileNodes = ENVIRONMENT_SCOPE_FIXTURE;
    const nodes = toTreeNodes(fileNodes);
    expect(nodes.some((n) => n.data?.kind === 'folder')).toBe(true);
    expect(nodes.some((n) => n.data?.kind === 'variable')).toBe(true);
    expect(fromTreeNodes(nodes)).toEqual(fileNodes);
  });

  it('maps variable label from key', () => {
    const nodes = toTreeNodes([
      {
        id: 'v1',
        kind: 'variable',
        key: 'baseUrl',
        value: 'http://localhost',
      },
    ]);
    expect(nodes[0].label).toBe('baseUrl');
    expect(nodes[0].data?.kind).toBe('variable');
  });

  it('maps variable description to tree subtitle', () => {
    const nodes = toTreeNodes([
      {
        id: 'v1',
        kind: 'variable',
        key: 'baseUrl',
        value: 'http://localhost',
        description: 'API root URL',
      },
    ]);
    expect(nodes[0].subtitle).toBe('API root URL');
  });

  it('maps folder description to tree subtitle', () => {
    const nodes = toTreeNodes([
      {
        id: 'f1',
        kind: 'folder',
        label: 'Auth',
        description: 'Login helpers',
        children: [],
      },
    ]);
    expect(nodes[0].subtitle).toBe('Login helpers');
  });
});

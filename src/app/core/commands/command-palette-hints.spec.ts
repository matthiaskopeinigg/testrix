import { describe, expect, it } from 'vitest';

import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

import {
  collectionPaletteHint,
  environmentPaletteHint,
  historyPaletteHint,
} from './command-palette-hints';

describe('command-palette-hints', () => {
  it('builds request hint from method and URL', () => {
    const node: CollectionTreeNode = {
      id: 'r1',
      label: 'Get users',
      data: { kind: 'request', method: 'GET', url: 'https://api.example/users' },
    };
    expect(collectionPaletteHint(node, 'API / Get users')).toBe('GET https://api.example/users');
  });

  it('builds environment hint from description or name', () => {
    expect(
      environmentPaletteHint({
        id: 'e1',
        name: 'Staging',
        description: '  Pre-production vars  ',
        nodes: [],
      }),
    ).toBe('Pre-production vars');
    expect(
      environmentPaletteHint({
        id: 'e2',
        name: 'Local',
        nodes: [],
      }),
    ).toBe('Environment · Local');
  });

  it('builds history hint from method and URL', () => {
    expect(
      historyPaletteHint({
        id: 'h1',
        label: 'GET users',
        data: { kind: 'history', method: 'POST', url: 'https://api.example/login', requestedAt: '' },
      }),
    ).toBe('POST https://api.example/login');
  });
});

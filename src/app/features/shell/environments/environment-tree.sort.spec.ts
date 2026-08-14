import { describe, expect, it } from 'vitest';

import { sortEnvironmentTreeByName } from './environment-tree.sort';
import type { EnvironmentTreeNode } from './environment-tree.types';

describe('sortEnvironmentTreeByName', () => {
  it('sorts siblings by label at each level', () => {
    const nodes: EnvironmentTreeNode[] = [
      {
        id: 'z-folder',
        label: 'Zulu',
        kind: 'folder',
        children: [
          {
            id: 'z-var',
            label: 'zebra',
            kind: 'leaf',
            data: { kind: 'variable', key: 'zebra', value: '' },
          },
          {
            id: 'a-var',
            label: 'alpha',
            kind: 'leaf',
            data: { kind: 'variable', key: 'alpha', value: '' },
          },
        ],
      },
      {
        id: 'a-folder',
        label: 'Alpha',
        kind: 'folder',
        children: [],
      },
    ];

    const sorted = sortEnvironmentTreeByName(nodes);
    expect(sorted.map((node) => node.label)).toEqual(['Alpha', 'Zulu']);
    expect(sorted[1].children?.map((child) => child.label)).toEqual(['alpha', 'zebra']);
  });
});

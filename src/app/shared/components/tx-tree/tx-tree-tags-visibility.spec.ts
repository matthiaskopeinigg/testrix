import { describe, expect, it } from 'vitest';

import { applyTreeTagsVisibility } from './tx-tree-tags-visibility';
import type { TxTreeNode } from './tx-tree.types';

describe('applyTreeTagsVisibility', () => {
  const nodes: TxTreeNode[] = [
    {
      id: 'f1',
      label: 'Folder',
      tags: ['api'],
      children: [{ id: 'r1', label: 'Request', tags: ['auth'] }],
    },
  ];

  it('preserves tags when enabled', () => {
    const result = applyTreeTagsVisibility(nodes, true);
    expect(result[0]?.tags).toEqual(['api']);
    expect(result[0]?.children?.[0]?.tags).toEqual(['auth']);
  });

  it('strips tags recursively when disabled', () => {
    const result = applyTreeTagsVisibility(nodes, false);
    expect(result[0]?.tags).toBeUndefined();
    expect(result[0]?.children?.[0]?.tags).toBeUndefined();
  });
});

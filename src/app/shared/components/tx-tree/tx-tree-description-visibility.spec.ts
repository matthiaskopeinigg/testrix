import { describe, expect, it } from 'vitest';

import { applyTreeDescriptionVisibility } from './tx-tree-description-visibility';
import type { TxTreeNode } from './tx-tree.types';

describe('applyTreeDescriptionVisibility', () => {
  const nodes: TxTreeNode[] = [
    {
      id: 'f1',
      label: 'Folder',
      subtitle: 'Folder note',
      children: [
        {
          id: 'v1',
          label: 'key',
          subtitle: 'Var note',
        },
      ],
    },
  ];

  it('returns nodes unchanged when descriptions are shown', () => {
    const result = applyTreeDescriptionVisibility(nodes, true);
    expect(result[0]?.subtitle).toBe('Folder note');
    expect(result[0]?.children?.[0]?.subtitle).toBe('Var note');
  });

  it('strips subtitles recursively when descriptions are hidden', () => {
    const result = applyTreeDescriptionVisibility(nodes, false);
    expect(result[0]?.subtitle).toBeUndefined();
    expect(result[0]?.children?.[0]?.subtitle).toBeUndefined();
    expect(result[0]?.label).toBe('Folder');
  });
});

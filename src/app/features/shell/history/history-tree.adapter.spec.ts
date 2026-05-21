import { describe, expect, it } from 'vitest';

import { fromTreeNodes, toTreeNodes } from './history-tree.adapter';
import { HISTORY_ITEMS_FIXTURE } from './history-tree.fixture';

describe('history-tree.adapter', () => {
  it('round-trips history items through tree nodes', () => {
    const items = HISTORY_ITEMS_FIXTURE;
    const nodes = toTreeNodes(items);
    expect(nodes.every((node) => node.kind === 'leaf' && node.data?.kind === 'history')).toBe(true);
    expect(fromTreeNodes(nodes)).toEqual(items);
  });
});

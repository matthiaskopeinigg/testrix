import { describe, expect, it } from 'vitest';

import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
import { filterCollectionTree } from './collection-tree.filter';

describe('filterCollectionTree', () => {
  it('returns all nodes when query is empty', () => {
    expect(filterCollectionTree(COLLECTION_TREE_MOCK, '')).toHaveLength(COLLECTION_TREE_MOCK.length);
  });

  it('keeps Auth folder and matching login request', () => {
    const result = filterCollectionTree(COLLECTION_TREE_MOCK, 'login');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('folder-auth');
    expect(result[0].children?.map((n) => n.id)).toEqual(['req-login']);
  });

  it('matches WebSocket labels', () => {
    const result = filterCollectionTree(COLLECTION_TREE_MOCK, 'notifications');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('folder-realtime');
    expect(result[0].children?.some((n) => n.kind === 'websocket')).toBe(true);
  });
});

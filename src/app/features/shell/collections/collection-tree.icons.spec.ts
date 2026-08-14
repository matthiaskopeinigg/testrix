import { describe, expect, it } from 'vitest';

import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
import { withCollectionTreeIcons } from './collection-tree.icons';

describe('withCollectionTreeIcons', () => {
  it('reuses node references when icons are already correct', () => {
    const firstPass = withCollectionTreeIcons(COLLECTION_TREE_MOCK);
    const secondPass = withCollectionTreeIcons(firstPass);
    expect(secondPass).toBe(firstPass);
    expect(secondPass[0]).toBe(firstPass[0]);
  });
});

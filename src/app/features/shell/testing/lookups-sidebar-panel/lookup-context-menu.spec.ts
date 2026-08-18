import { describe, expect, it } from 'vitest';

import { buildEmptyLookupContextMenu, buildLookupNodeContextMenu } from './lookup-context-menu';

describe('lookup-context-menu', () => {
  it('offers create on empty area', () => {
    expect(buildEmptyLookupContextMenu().map((item) => item.id)).toEqual(['new-lookup']);
  });

  it('offers open, rename, and delete on a row', () => {
    expect(buildLookupNodeContextMenu().map((item) => item.id)).toEqual(['open', 'rename', 'delete']);
  });
});

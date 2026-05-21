import { describe, expect, it } from 'vitest';

import {
  buildCollectionNodeContextMenu,
  buildEmptyCollectionContextMenu,
} from './collection-context-menu';

describe('collection-context-menu', () => {
  it('builds root create menu', () => {
    const items = buildEmptyCollectionContextMenu();
    expect(items.map((i) => i.id)).toEqual(['new-folder', 'new-request', 'new-websocket']);
  });

  it('builds folder menu with expand action when collapsed', () => {
    const items = buildCollectionNodeContextMenu('folder', false);
    expect(items.some((i) => i.id === 'expand')).toBe(true);
    expect(items.some((i) => i.id === 'rename')).toBe(true);
  });

  it('builds request menu with duplicate', () => {
    const items = buildCollectionNodeContextMenu('request', false);
    expect(items.map((i) => i.id)).toEqual(['rename', 'duplicate', 'delete']);
  });
});

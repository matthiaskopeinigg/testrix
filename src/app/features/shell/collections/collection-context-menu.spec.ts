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

  it('builds folder menu with open and expand when collapsed', () => {
    const items = buildCollectionNodeContextMenu('folder', false);
    expect(items.some((i) => i.id === 'open')).toBe(true);
    expect(items.some((i) => i.id === 'expand')).toBe(true);
    expect(items.some((i) => i.id === 'collapse')).toBe(false);
  });

  it('omits collapse and expand on expanded folders', () => {
    const items = buildCollectionNodeContextMenu('folder', true);
    expect(items.some((i) => i.id === 'open')).toBe(true);
    expect(items.some((i) => i.id === 'expand')).toBe(false);
    expect(items.some((i) => i.id === 'collapse')).toBe(false);
  });

  it('omits expand on empty collapsed folders', () => {
    const items = buildCollectionNodeContextMenu('folder', false, false);
    expect(items.some((i) => i.id === 'open')).toBe(true);
    expect(items.some((i) => i.id === 'expand')).toBe(false);
  });

  it('builds request menu with open, favourite, and duplicate', () => {
    const items = buildCollectionNodeContextMenu('request', false);
    expect(items.map((i) => i.id)).toEqual([
      'open',
      'toggle-favourite',
      'rename',
      'duplicate',
      'export-selection',
      'delete',
    ]);
  });

  it('shows remove from favourites when item is favourited', () => {
    const items = buildCollectionNodeContextMenu('request', false, true, true);
    expect(items.find((i) => i.id === 'toggle-favourite')?.label).toBe('Remove from favourites');
  });
});

import type { HistoryEntry } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { HISTORY_SMART_GROUP_THRESHOLD, HistoryStore } from './history.store';

const NO_MODIFIERS = { shiftKey: false, ctrlKey: false, metaKey: false };

function entry(id: string, patch: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    at: new Date().toISOString(),
    method: 'GET',
    url: `https://api.local/${id}`,
    status: 200,
    statusText: 'OK',
    durationMs: 1,
    sizeLabel: '1 B',
    error: null,
    requestHeaders: [],
    requestBody: '',
    responseHeaders: [],
    responseBody: '',
    requestId: `req-${id}`,
    requestName: id,
    workspaceId: 'ws_1',
    ...patch,
  };
}

describe('HistoryStore', () => {
  let saveHistory: ReturnType<typeof vi.fn>;
  let store: HistoryStore;

  beforeEach(() => {
    saveHistory = vi.fn(() => Promise.resolve());
    store = createStoreHarness(HistoryStore, { saveHistory } as never).store;
  });

  it('groups small histories by status and large ones by day', () => {
    // Arrange
    const few = [entry('a')];
    const many = Array.from({ length: HISTORY_SMART_GROUP_THRESHOLD }, (_, index) => entry(`e${index}`));

    // Act
    store.hydrate({ schemaVersion: 1, entries: few });
    const smallGrouping = store.groupBy();
    store.hydrate({ schemaVersion: 1, entries: many });
    const largeGrouping = store.groupBy();
    store.hydrate({ schemaVersion: 1, entries: few }, 'method');

    // Assert
    expect(smallGrouping).toBe('status');
    expect(largeGrouping).toBe('day');
    expect(store.groupBy()).toBe('method');
  });

  it('filters by method, status class and search query', () => {
    // Arrange
    store.hydrate({
      schemaVersion: 1,
      entries: [
        entry('ok', { method: 'GET', status: 200 }),
        entry('bad', { method: 'POST', status: 500, url: 'https://api.local/orders' }),
      ],
    });

    // Act
    store.toggleMethod('POST');
    const byMethod = store.filtered().map((item) => item.id);
    store.toggleMethod('POST');
    store.toggleStatusClass('server');
    const byStatus = store.filtered().map((item) => item.id);
    store.clearFilters();
    store.setSearchQuery('orders');
    const bySearch = store.filtered().map((item) => item.id);

    // Assert
    expect(byMethod).toEqual(['bad']);
    expect(byStatus).toEqual(['bad']);
    expect(bySearch).toEqual(['bad']);
    expect(store.isFilterActive()).toBe(true);
  });

  it('prunes the selection and saves when entries are removed', async () => {
    // Arrange
    store.hydrate({ schemaVersion: 1, entries: [entry('a'), entry('b'), entry('c')] });
    store.applyPointerSelect('a', NO_MODIFIERS);

    // Act
    await store.removeMany(['a', 'missing']);

    // Assert
    expect(store.entries().map((item) => item.id)).toEqual(['b', 'c']);
    expect(store.selectedIds()).toEqual([]);
    expect(store.selectionAnchorId()).toBeNull();
    expect(saveHistory).toHaveBeenCalledWith({ entries: store.entries() });
  });

  it('does not save when nothing matches', async () => {
    // Arrange
    store.hydrate({ schemaVersion: 1, entries: [entry('a')] });

    // Act
    await store.removeMany(['missing']);
    await store.removeOlderThanDays(0);

    // Assert
    expect(saveHistory).not.toHaveBeenCalled();
  });

  it('drops entries older than the cutoff', async () => {
    // Arrange
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    store.hydrate({ schemaVersion: 1, entries: [entry('new'), entry('old', { at: old })] });

    // Act
    await store.removeOlderThanDays(7);

    // Assert
    expect(store.entries().map((item) => item.id)).toEqual(['new']);
  });

  it('prepends new entries and persists them', async () => {
    // Arrange
    store.hydrate({ schemaVersion: 1, entries: [entry('a')] });

    // Act
    await store.append(entry('b'));

    // Assert
    expect(store.entries()[0]?.id).toBe('b');
    expect(saveHistory).toHaveBeenCalledTimes(1);
  });
});

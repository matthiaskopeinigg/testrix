import { DEFAULT_DATABASES_FILE, DEFAULT_QUERIES_FILE } from '@testrix/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { DatabaseStore } from './database.store';

describe('DatabaseStore', () => {
  let statuses: ReturnType<typeof vi.fn>;
  let store: DatabaseStore;

  beforeEach(() => {
    vi.useFakeTimers();
    statuses = vi.fn(() => Promise.resolve({}));
    store = createStoreHarness(DatabaseStore, {
      api: { database: { statuses } },
      saveDatabases: vi.fn(() => Promise.resolve()),
      saveQueries: vi.fn(() => Promise.resolve()),
    } as never).store;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates empty trees and toggles sidebar sections', () => {
    store.hydrate(DEFAULT_DATABASES_FILE, DEFAULT_QUERIES_FILE, 'ws_1');
    const connectionsOpen = store.connectionsOpen();
    store.toggleSection('connections');
    expect(store.connectionsOpen()).toBe(!connectionsOpen);
    store.toggleSection('queries');
    expect(store.queries().length).toBe(0);
  });

  it('creates a pending connection and can discard it', () => {
    store.hydrate({ ...DEFAULT_DATABASES_FILE, nodes: [] }, { ...DEFAULT_QUERIES_FILE, nodes: [] }, 'ws_1');
    const pending = store.createPendingConnection(null, 'sqlite');
    expect(store.isPendingConnection(pending.id)).toBe(true);
    store.discardPendingConnection(pending.id);
    expect(store.isPendingConnection(pending.id)).toBe(false);
  });

  it('filters the sidebar search query', () => {
    store.hydrate(DEFAULT_DATABASES_FILE, DEFAULT_QUERIES_FILE, 'ws_1');
    store.setSearchQuery('orders');
    expect(store.searchQuery()).toBe('orders');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { WorkbenchStore } from '../workbench/workbench.store';
import { ServicesStore } from './services.store';

function off(): () => void {
  return () => undefined;
}

describe('ServicesStore', () => {
  let store: ServicesStore;

  beforeEach(() => {
    store = createStoreHarness(ServicesStore, {
      api: {
        services: {
          onFlowEvent: () => off(),
          onFlowManualPrompt: () => off(),
          onLoadMetrics: () => off(),
          onRegressionEvent: () => off(),
          onMocksActivity: () => off(),
          onListenerHit: () => off(),
          onListenerStatus: () => off(),
          onInterceptHit: () => off(),
          onInterceptStatus: () => off(),
          onDeviceEvent: () => off(),
          regressions: { get: () => Promise.resolve({ schemaVersion: 1, items: [] }) },
        },
      },
      flows: { set: vi.fn() },
      load: { set: vi.fn() },
      mocks: { set: vi.fn() },
      listeners: { set: vi.fn() },
      intercept: { set: vi.fn() },
      regressions: { set: vi.fn() },
    } as never, [{ provide: WorkbenchStore, useValue: { openFromService: vi.fn() } }]).store;
  });

  it('keeps per-service search and expansion', () => {
    store.setSearch('flows', 'login');
    expect(store.search('flows')).toBe('login');
    store.toggleExpanded('flows', 'folder-1');
    expect(store.expanded('flows')).toEqual(['folder-1']);
    store.toggleExpanded('flows', 'folder-1');
    expect(store.expanded('flows')).toEqual([]);
  });

  it('hydrates the active service from the session', () => {
    store.hydrateFromSession('load', { load: { search: 'p95', expandedIds: ['f1'], sort: 'name', tags: [] } });
    expect(store.activeService()).toBe('load');
    expect(store.search('load')).toBe('p95');
    expect(store.expanded('load')).toEqual(['f1']);
  });
});

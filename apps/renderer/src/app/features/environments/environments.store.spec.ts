import { createDefaultEnvironmentsFile } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { EnvironmentsStore } from './environments.store';

describe('EnvironmentsStore', () => {
  let saveEnvironments: ReturnType<typeof vi.fn>;
  let store: EnvironmentsStore;

  beforeEach(() => {
    saveEnvironments = vi.fn(() => Promise.resolve());
    store = createStoreHarness(EnvironmentsStore, { saveEnvironments } as never).store;
  });

  it('hydrates and filters by search', () => {
    store.hydrate(createDefaultEnvironmentsFile());
    expect(store.items().length).toBeGreaterThan(1);
    store.setSearchQuery('local');
    expect(store.visibleEnvironments().every((item) => item.name.toLowerCase().includes('local'))).toBe(true);
  });

  it('creates, activates and removes environments', () => {
    store.hydrate(createDefaultEnvironmentsFile());
    const created = store.create();
    expect(store.items().some((item) => item.id === created.id)).toBe(true);
    store.setActive(created.id);
    expect(store.isActive(created.id)).toBe(true);
    store.remove([created.id]);
    expect(store.items().some((item) => item.id === created.id)).toBe(false);
  });

  it('renames and tracks list selection', () => {
    store.hydrate(createDefaultEnvironmentsFile());
    const id = store.items()[0]?.id ?? '';
    store.rename(id, 'Studio');
    expect(store.environmentById(id)?.name).toBe('Studio');
    store.applyListPointerSelect(id, { shiftKey: false, ctrlKey: false, metaKey: false });
    expect(store.isSelected(id)).toBe(true);
  });
});

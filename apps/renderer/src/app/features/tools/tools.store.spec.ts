import { DEFAULT_TOOLS } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { ToolsStore } from './tools.store';

describe('ToolsStore', () => {
  let patchSettings: ReturnType<typeof vi.fn>;
  let store: ToolsStore;

  beforeEach(() => {
    patchSettings = vi.fn(() => Promise.resolve());
    store = createStoreHarness(ToolsStore, {
      settings: () => ({ toolsOrderIds: [] }),
      session: () => ({ toolsDrill: null }),
      patchSettings,
    } as never).store;
  });

  it('hydrates the default tool order', () => {
    store.hydrate();
    expect(store.items().map((item) => item.id)).toEqual(DEFAULT_TOOLS.map((item) => item.id));
  });

  it('drills into PlantUML and back', () => {
    store.hydrate();
    store.drillIn('plantuml');
    expect(store.drillId()).toBe('plantuml');
    expect(store.isDrilled()).toBe(true);
    store.back();
    expect(store.drillId()).toBeNull();
  });
});

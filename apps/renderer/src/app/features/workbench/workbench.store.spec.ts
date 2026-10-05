import { ɵChangeDetectionScheduler } from '@angular/core';
import { DEFAULT_TOOLS } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { HttpInflightRegistry } from '../../core/http-inflight.registry';
import { ShellStateService } from '../../core/shell-state.service';
import { WorkbenchStore } from './workbench.store';

describe('WorkbenchStore', () => {
  let store: WorkbenchStore;

  beforeEach(() => {
    store = createStoreHarness(
      WorkbenchStore,
      {} as never,
      [
        { provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined } },
        { provide: HttpInflightRegistry, useValue: { abortIdFor: () => null, clear: vi.fn() } },
        { provide: DirtyTabsRegistry, useValue: { clear: vi.fn() } },
        { provide: ShellStateService, useValue: { setSoftRailHighlight: vi.fn() } },
      ],
    ).store;
  });

  it('opens a tool tab and focuses it again instead of duplicating', () => {
    const tool = DEFAULT_TOOLS[0]!;
    store.openFromTool(tool);
    expect(store.hasTabs()).toBe(true);
    expect(store.activeTab()?.nodeId).toBe(tool.id);
    const firstId = store.activeTab()?.id;
    store.openFromTool(tool);
    expect(store.tabCount()).toBe(1);
    expect(store.activeTab()?.id).toBe(firstId);
  });

  it('closes inactive tabs and remembers the last closed tab', () => {
    store.openFromTool(DEFAULT_TOOLS[0]!);
    store.openFromTool(DEFAULT_TOOLS[1]!);
    expect(store.tabCount()).toBe(2);
    store.closeInactiveTabs();
    expect(store.tabCount()).toBe(1);
    expect(store.lastClosedTab()?.nodeId).toBe(DEFAULT_TOOLS[0]!.id);
  });
});

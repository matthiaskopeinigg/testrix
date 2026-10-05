import { signal } from '@angular/core';
import { MAX_PALETTE_PINS, type PalettePin, type SessionFile } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../testing/store-harness';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';
import { PalettePinsStore } from './palette-pins.store';

describe('PalettePinsStore', () => {
  const session = signal<Partial<SessionFile>>({});
  const activeId = signal<string | null>('ws_1');
  let saveSession: ReturnType<typeof vi.fn>;
  let store: PalettePinsStore;

  beforeEach(() => {
    session.set({});
    activeId.set('ws_1');
    saveSession = vi.fn((patch: Partial<SessionFile>) => {
      session.update((current) => ({ ...current, ...patch }));
      return Promise.resolve();
    });
    store = createStoreHarness(PalettePinsStore, { session, saveSession } as never, [
      { provide: WorkspacesStore, useValue: { activeId } },
    ]).store;
  });

  it('pins per workspace, newest first, without duplicates', async () => {
    // Act
    await store.pin('http', 'r1', 'One');
    await store.pin('http', 'r2', 'Two');
    await store.pin('http', 'r1', 'One again');
    activeId.set('ws_2');
    const otherWorkspace = store.pins();
    activeId.set('ws_1');

    // Assert
    expect(store.pins().map((pin) => pin.id)).toEqual(['r2', 'r1']);
    expect(otherWorkspace).toEqual([]);
  });

  it('caps the pin list', async () => {
    // Act
    for (let index = 0; index <= MAX_PALETTE_PINS; index += 1)
      await store.pin('http', `r${index}`, `R${index}`);

    // Assert
    expect(store.pins()).toHaveLength(MAX_PALETTE_PINS);
    expect(store.pins()[0]?.id).toBe(`r${MAX_PALETTE_PINS}`);
  });

  it('toggles and prunes pins whose targets are gone', async () => {
    // Arrange
    await store.pin('http', 'keep', 'Keep');
    await store.pin('flow', 'gone', 'Gone');

    // Act
    await store.toggle('http', 'keep', 'Keep');
    const afterToggle = store.pins().map((pin: PalettePin) => pin.id);
    await store.pin('http', 'keep', 'Keep');
    await store.pruneMissing(new Set(['http:keep']));

    // Assert
    expect(afterToggle).toEqual(['gone']);
    expect(store.pins().map((pin) => pin.id)).toEqual(['keep']);
  });

  it('does nothing without an active workspace', async () => {
    // Arrange
    activeId.set(null);

    // Act
    await store.pin('http', 'r1', 'One');

    // Assert
    expect(saveSession).not.toHaveBeenCalled();
  });
});

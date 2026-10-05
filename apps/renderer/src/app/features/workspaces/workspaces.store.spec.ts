import type { Workspace, WorkspaceSnapshot, WorkspacesFile } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { ServicesStore } from '../services/services.store';
import { WorkspacesStore } from './workspaces.store';

const ISO = '2026-01-01T00:00:00.000Z';

function workspace(id: string): Workspace {
  return { id, name: id.toUpperCase(), folder: id, modifiedAt: ISO };
}

function file(ids: readonly string[], activeId: string | null = ids[0] ?? null): WorkspacesFile {
  return { schemaVersion: 1, items: ids.map(workspace), activeId, orderIds: [...ids] };
}

function snapshot(workspaces: WorkspacesFile): WorkspaceSnapshot {
  return { workspaces } as WorkspaceSnapshot;
}

describe('WorkspacesStore', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let ask: ReturnType<typeof vi.fn>;
  let applySnapshot: ReturnType<typeof vi.fn>;
  let store: WorkspacesStore;

  beforeEach(() => {
    api = {
      switch: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      reorder: vi.fn(),
      duplicate: vi.fn(),
      delete: vi.fn(),
    };
    ask = vi.fn(() => Promise.resolve(true));
    applySnapshot = vi.fn();
    store = createStoreHarness(
      WorkspacesStore,
      { api: { workspaces: api }, applySnapshot, workspaces: { set: vi.fn() } } as never,
      [
        { provide: ConfirmDialogService, useValue: { ask } },
        { provide: ServicesStore, useValue: { flushPendingDeletes: () => Promise.resolve() } },
      ],
    ).store;
  });

  it('ignores switching before hydrate and to the active workspace', async () => {
    // Act
    const beforeHydrate = await store.switchTo('b');
    store.hydrate(file(['a', 'b']));
    const toActive = await store.switchTo('a');

    // Assert
    expect(beforeHydrate).toBeNull();
    expect(toActive).toBeNull();
    expect(api['switch']).not.toHaveBeenCalled();
  });

  it('applies the snapshot returned by a switch', async () => {
    // Arrange
    store.hydrate(file(['a', 'b']));
    api['switch']!.mockResolvedValue(snapshot(file(['a', 'b'], 'b')));

    // Act
    await store.switchTo('b');

    // Assert
    expect(store.activeId()).toBe('b');
    expect(applySnapshot).toHaveBeenCalledTimes(1);
  });

  it('reorders optimistically and rolls back when the host fails', async () => {
    // Arrange
    store.hydrate(file(['a', 'b', 'c']));
    let reject: (error: Error) => void = () => undefined;
    api['reorder']!.mockReturnValue(new Promise((_resolve, fail) => (reject = fail)));

    // Act
    const pending = store.reorder(['c', 'a', 'b']);
    const optimistic = store.items().map((item) => item.id);
    reject(new Error('disk full'));
    await pending;

    // Assert
    expect(optimistic).toEqual(['c', 'a', 'b']);
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips a reorder that changes nothing', async () => {
    // Arrange
    store.hydrate(file(['a', 'b']));

    // Act
    await store.reorder(['a', 'b']);

    // Assert
    expect(api['reorder']).not.toHaveBeenCalled();
  });

  it('never deletes the last workspace and asks before deleting', async () => {
    // Arrange
    store.hydrate(file(['a']));

    // Act
    const onlyOne = await store.delete('a');
    store.hydrate(file(['a', 'b']));
    ask.mockResolvedValueOnce(false);
    const declined = await store.delete('b');

    // Assert
    expect(onlyOne).toBeNull();
    expect(declined).toBeNull();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[0]).toMatchObject({ title: 'Delete workspace' });
    expect(api['delete']).not.toHaveBeenCalled();
  });
});

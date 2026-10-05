import '@angular/compiler';
import type { UpdateStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TxToastService } from '@testrix/ui';

import { createStoreHarness } from '../../../testing/store-harness';
import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { UpdateStore } from './update.store';
import { idleUpdateStatus } from './update-view';

function status(patch: Partial<UpdateStatus> = {}): UpdateStatus {
  return { ...idleUpdateStatus('2.0.0'), isSupported: true, ...patch };
}

const RELEASE = { version: '2.1.0', notes: '- Toast journey', releasedAt: '2026-09-01T00:00:00.000Z', size: 10 };

/**
 * Store-level updater journey: available toast → meter → preparing → install hand-off.
 */
describe('Update toast journey', () => {
  let push: (next: UpdateStatus) => void;
  let finishDownload!: (next: UpdateStatus) => void;
  let api: {
    getStatus: ReturnType<typeof vi.fn>;
    onStatus: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    install: ReturnType<typeof vi.fn>;
    setPrefs: ReturnType<typeof vi.fn>;
    check: ReturnType<typeof vi.fn>;
  };
  let toasts: TxToastService;
  let store: UpdateStore;

  beforeEach(() => {
    toasts = new TxToastService();
    api = {
      getStatus: vi.fn(async () => status()),
      onStatus: vi.fn((listener: (next: UpdateStatus) => void) => {
        push = listener;
        return () => undefined;
      }),
      check: vi.fn(async () => status({ phase: 'up-to-date' })),
      download: vi.fn(
        () =>
          new Promise<UpdateStatus>((resolve) => {
            finishDownload = resolve;
          }),
      ),
      install: vi.fn(async () => true),
      setPrefs: vi.fn(async () => status()),
    };
    store = createStoreHarness(UpdateStore, { api: { update: api } } as never, [
      { provide: TxToastService, useValue: toasts },
      { provide: ConfirmDialogService, useValue: { ask: vi.fn(async () => true) } },
      { provide: SessionPersistenceService, useValue: { flush: vi.fn(async () => undefined) } },
      { provide: DirtyTabsRegistry, useValue: new DirtyTabsRegistry() },
    ]).store;
  });

  it('walks available → progress → preparing → installing on one toast', async () => {
    push(status({ phase: 'available', release: RELEASE }));
    expect(toasts.items()[0]?.message).toBe('Testrix 2.1 is available.');
    expect(toasts.items()[0]?.dismissLabel).toBe('Later');

    const pending = store.downloadAndInstall();
    expect(toasts.items()[0]?.message).toBe('Downloading Testrix 2.1');
    expect(toasts.items()[0]?.progress).toBeNull();

    push(status({ phase: 'downloading', percent: 40, release: RELEASE }));
    expect(toasts.items()[0]?.progress).toBe(40);

    push(status({ phase: 'downloading', percent: 100, release: RELEASE }));
    expect(toasts.items()[0]?.message).toBe('Preparing the update…');
    expect(toasts.items()[0]?.progress).toBeNull();

    finishDownload(status({ phase: 'ready', release: RELEASE }));
    await pending;

    expect(toasts.items()).toHaveLength(1);
    expect(toasts.items()[0]?.message).toBe('Installing update…');
    expect(api.install).toHaveBeenCalledOnce();
  });

  it('turns a finished download into an Install toast when auto-install is off', () => {
    push(status({ phase: 'available', release: RELEASE }));
    push(status({ phase: 'downloading', percent: 100, release: RELEASE }));
    push(status({ phase: 'ready', release: RELEASE }));

    expect(toasts.items()[0]?.message).toBe('Testrix 2.1 is ready to install.');
    expect(toasts.items()[0]?.action?.label).toBe('Install');
    expect(toasts.items()[0]?.progress).toBeUndefined();
  });
});

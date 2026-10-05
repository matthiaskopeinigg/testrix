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

const READY = status({
  phase: 'ready',
  release: { version: '2.1.0', notes: '- New', releasedAt: '2026-09-01T00:00:00.000Z', size: 10 },
});

describe('UpdateStore', () => {
  let push: (next: UpdateStatus) => void;
  let api: {
    getStatus: ReturnType<typeof vi.fn>;
    onStatus: ReturnType<typeof vi.fn>;
    check: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    install: ReturnType<typeof vi.fn>;
    setPrefs: ReturnType<typeof vi.fn>;
  };
  let toasts: {
    show: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  let confirm: { ask: ReturnType<typeof vi.fn> };
  let session: { flush: ReturnType<typeof vi.fn> };
  let dirtyTabs: DirtyTabsRegistry;
  let store: UpdateStore;

  beforeEach(() => {
    api = {
      getStatus: vi.fn(async () => status()),
      onStatus: vi.fn((listener: (next: UpdateStatus) => void) => {
        push = listener;
        return () => undefined;
      }),
      check: vi.fn(async () => status({ phase: 'up-to-date' })),
      download: vi.fn(async () => status()),
      install: vi.fn(async () => true),
      setPrefs: vi.fn(async () => status({ prefs: { channel: 'beta', autoCheck: true, autoDownload: true }, channel: 'beta' })),
    };
    toasts = { show: vi.fn(() => 'toast-1'), update: vi.fn(() => true), dismiss: vi.fn() };
    confirm = { ask: vi.fn(async () => true) };
    session = { flush: vi.fn(async () => undefined) };
    dirtyTabs = new DirtyTabsRegistry();
    store = createStoreHarness(UpdateStore, { api: { update: api } } as never, [
      { provide: TxToastService, useValue: toasts },
      { provide: ConfirmDialogService, useValue: confirm },
      { provide: SessionPersistenceService, useValue: session },
      { provide: DirtyTabsRegistry, useValue: dirtyTabs },
    ]).store;
  });

  it('shows a Download & Install toast when a release is waiting', () => {
    const available = status({
      phase: 'available',
      release: { version: '2.1.0', notes: '- New', releasedAt: '2026-09-01T00:00:00.000Z', size: 10 },
    });

    push(available);
    push({ ...available, lastCheckedAt: '2026-09-02T00:00:00.000Z' });

    expect(store.availableVersion()).toBe('2.1.0');
    expect(store.noticeLabel()).toBe('Testrix 2.1 is available');
    expect(toasts.show).toHaveBeenCalledTimes(1);
    expect(toasts.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Testrix 2.1 is available.',
        dismissOnAction: false,
        dismissLabel: 'Later',
        action: expect.objectContaining({ label: 'Download & Install' }),
      }),
    );
  });

  it('keeps the toast and shows download progress until the file is ready', async () => {
    const available = status({
      phase: 'available',
      release: READY.release,
    });
    push(available);
    let finishDownload!: (next: UpdateStatus) => void;
    api.download.mockImplementation(
      () =>
        new Promise<UpdateStatus>((resolve) => {
          finishDownload = resolve;
        }),
    );

    const pending = store.downloadAndInstall();
    push(status({ phase: 'downloading', percent: 40, release: READY.release }));
    finishDownload(READY);
    await pending;

    expect(toasts.update).toHaveBeenCalledWith(
      'toast-1',
      expect.objectContaining({ message: 'Downloading Testrix 2.1', progress: 40 }),
    );
    expect(toasts.update).toHaveBeenCalledWith(
      'toast-1',
      expect.objectContaining({ message: 'Installing update…', progress: null }),
    );
    expect(toasts.dismiss).not.toHaveBeenCalled();
    expect(api.install).toHaveBeenCalledOnce();
  });

  it('leaves 100% behind once the file is in', () => {
    push(status({ phase: 'available', release: READY.release }));
    push(status({ phase: 'downloading', percent: 100, release: READY.release }));

    expect(toasts.update).toHaveBeenCalledWith(
      'toast-1',
      expect.objectContaining({ message: 'Preparing the update…', progress: null }),
    );
  });

  it('downloads then installs from Download & Install', async () => {
    api.download.mockResolvedValueOnce(READY);

    await store.downloadAndInstall();

    expect(api.download).toHaveBeenCalledOnce();
    expect(api.install).toHaveBeenCalledOnce();
  });

  it('shows one Install toast per ready version', () => {
    // Act
    push(READY);
    push({ ...READY, lastCheckedAt: '2026-09-02T00:00:00.000Z' });

    // Assert
    expect(store.readyVersion()).toBe('2.1.0');
    expect(toasts.show).toHaveBeenCalledTimes(1);
    expect(toasts.show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Testrix 2.1 is ready to install.',
        dismissLabel: 'Later',
        action: expect.objectContaining({ label: 'Install' }),
      }),
    );
  });

  it('saves the session and hands over to Setup on install', async () => {
    // Arrange
    push(READY);

    // Act
    await store.install();

    // Assert
    expect(session.flush).toHaveBeenCalledOnce();
    expect(api.install).toHaveBeenCalledOnce();
    expect(confirm.ask).not.toHaveBeenCalled();
  });

  it('asks before installing over unsaved tabs and stays when cancelled', async () => {
    // Arrange
    dirtyTabs.setDirty('tab-1', true);
    confirm.ask.mockResolvedValueOnce(false);

    // Act
    await store.install();

    // Assert
    expect(confirm.ask).toHaveBeenCalledOnce();
    expect(api.install).not.toHaveBeenCalled();
  });

  it('opens What’s new once after an update', () => {
    // Act
    push(status({ updatedFrom: '1.9.0' }));
    store.closeWhatsNew();
    push(status({ updatedFrom: '1.9.0', phase: 'up-to-date' }));

    // Assert
    expect(store.whatsNewOpen()).toBe(false);
  });

  it('flags What’s new when launched with --updated-from', () => {
    // Act
    push(status({ updatedFrom: '1.9.0' }));

    // Assert
    expect(store.whatsNewOpen()).toBe(true);
  });

  it('applies the status the main process returns for a channel change', async () => {
    // Act
    await store.setChannel('beta');

    // Assert
    expect(api.setPrefs).toHaveBeenCalledWith({ channel: 'beta' });
    expect(store.status().channel).toBe('beta');
  });

  it('writes automatic check and download prefs', async () => {
    api.setPrefs
      .mockResolvedValueOnce(status({ prefs: { channel: null, autoCheck: false, autoDownload: true } }))
      .mockResolvedValueOnce(status({ prefs: { channel: null, autoCheck: false, autoDownload: false } }));

    await store.setAutoCheck(false);
    await store.setAutoDownload(false);

    expect(api.setPrefs).toHaveBeenCalledWith({ autoCheck: false });
    expect(api.setPrefs).toHaveBeenCalledWith({ autoDownload: false });
    expect(store.status().prefs.autoDownload).toBe(false);
  });

  it('does not start a second download while one is already running', async () => {
    push(status({ phase: 'downloading', percent: 10, release: READY.release }));

    await store.downloadAndInstall();

    expect(api.download).not.toHaveBeenCalled();
  });

  it('shows the error on the live toast', () => {
    push(status({ phase: 'available', release: READY.release }));
    push(status({ phase: 'error', error: 'The download stopped. Try again to resume it.', release: READY.release }));

    expect(toasts.update).toHaveBeenCalledWith(
      'toast-1',
      expect.objectContaining({
        message: 'The download stopped. Try again to resume it.',
        dismissLabel: 'Later',
      }),
    );
  });

  it('keeps the toast when Setup does not start', async () => {
    api.install.mockResolvedValueOnce(false);
    push(READY);

    await store.install();

    expect(toasts.update).toHaveBeenCalledWith(
      'toast-1',
      expect.objectContaining({ message: 'The update is no longer ready. Check for updates again.' }),
    );
  });

  it('shows one available toast per version', () => {
    const available = status({ phase: 'available', release: READY.release });
    push(available);
    push({ ...available, lastCheckedAt: '2026-09-03T00:00:00.000Z' });

    expect(toasts.show).toHaveBeenCalledTimes(1);
  });
});

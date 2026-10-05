import { describe, expect, it, vi } from 'vitest';

import { TxToastService } from './tx-toast.service';

describe('TxToastService', () => {
  it('keeps a sticky toast until Later or dismiss', () => {
    vi.useFakeTimers();
    const toasts = new TxToastService();
    const id = toasts.show({
      message: 'Testrix 2.1 is available.',
      durationMs: 0,
      dismissLabel: 'Later',
    });

    vi.advanceTimersByTime(20_000);
    expect(toasts.items()).toHaveLength(1);
    toasts.dismiss(id);
    expect(toasts.items()).toEqual([]);
    vi.useRealTimers();
  });

  it('rewrites progress in place and can drop the meter', () => {
    const toasts = new TxToastService();
    const id = toasts.show({ message: 'Downloading Testrix 2.1', durationMs: 0, progress: 10 });

    expect(toasts.update(id, { progress: 40 })).toBe(true);
    expect(toasts.items()[0]).toEqual(expect.objectContaining({ message: 'Downloading Testrix 2.1', progress: 40 }));
    expect(toasts.update(id, { message: 'Preparing the update…', progress: null, action: null, dismissLabel: null })).toBe(
      true,
    );
    expect(toasts.items()[0]).toEqual(
      expect.objectContaining({ message: 'Preparing the update…', progress: null, action: undefined, dismissLabel: undefined }),
    );
    expect(toasts.update('gone', { progress: 1 })).toBe(false);
  });

  it('keeps the toast when dismissOnAction is false', () => {
    const onClick = vi.fn();
    const toasts = new TxToastService();
    toasts.show({
      message: 'Testrix 2.1 is available.',
      durationMs: 0,
      dismissOnAction: false,
      action: { label: 'Download & Install', onClick },
    });

    toasts.items()[0]?.action?.onClick();
    expect(onClick).toHaveBeenCalledOnce();
    expect(toasts.items()).toHaveLength(1);
  });

  it('dismisses on action by default and expires with onExpire', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const onClick = vi.fn();
    const toasts = new TxToastService();
    toasts.show({
      message: 'Saved',
      durationMs: 1_000,
      action: { label: 'Undo', onClick },
      onExpire,
    });
    toasts.items()[0]?.action?.onClick();
    expect(onClick).toHaveBeenCalledOnce();
    expect(toasts.items()).toEqual([]);

    toasts.show({ message: 'Gone soon', durationMs: 500, onExpire });
    vi.advanceTimersByTime(500);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(toasts.items()).toEqual([]);
    vi.useRealTimers();
  });
});

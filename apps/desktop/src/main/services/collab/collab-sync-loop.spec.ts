import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const focusListeners = vi.hoisted(() => new Set<() => void>());

vi.mock('electron', () => ({
  app: {
    on: (_name: string, listener: () => void) => focusListeners.add(listener),
    off: (_name: string, listener: () => void) => focusListeners.delete(listener),
  },
}));

const { CollabSyncLoop } = await import('./collab-sync-loop');

function focusWindow(): void {
  for (const listener of focusListeners)
    listener();
}

describe('CollabSyncLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    focusListeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces bursts of saves into one sync', () => {
    // Arrange
    const runSync = vi.fn();
    const loop = new CollabSyncLoop(runSync);

    // Act
    loop.schedule();
    vi.advanceTimersByTime(1_500);
    loop.schedule();
    vi.advanceTimersByTime(1_999);
    const beforeQuiet = runSync.mock.calls.length;
    vi.advanceTimersByTime(1);

    // Assert
    expect(beforeQuiet).toBe(0);
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  it('runs a poke at once and cancels the pending debounce', () => {
    // Arrange
    const runSync = vi.fn();
    const loop = new CollabSyncLoop(runSync);
    loop.schedule();

    // Act
    loop.poke();
    vi.advanceTimersByTime(5_000);

    // Assert
    expect(runSync).toHaveBeenCalledTimes(1);
  });

  it('polls every 30 s while idle and every 10 s while live', () => {
    // Arrange
    const runSync = vi.fn();
    const loop = new CollabSyncLoop(runSync);
    loop.start();

    // Act
    vi.advanceTimersByTime(30_000);
    const idleRuns = runSync.mock.calls.length;
    loop.setLive(true);
    vi.advanceTimersByTime(30_000);

    // Assert
    expect(idleRuns).toBe(1);
    expect(runSync).toHaveBeenCalledTimes(4);
    loop.stop();
  });

  it('syncs on window focus at most once a minute', () => {
    // Arrange
    const runSync = vi.fn();
    const loop = new CollabSyncLoop(runSync);
    loop.start();

    // Act
    focusWindow();
    focusWindow();
    vi.advanceTimersByTime(29_999);
    vi.setSystemTime(Date.now() + 60_000);
    focusWindow();

    // Assert
    expect(runSync).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('stops polling and listening after stop', () => {
    // Arrange
    const runSync = vi.fn();
    const loop = new CollabSyncLoop(runSync);
    loop.start();
    loop.schedule();

    // Act
    loop.stop();
    vi.advanceTimersByTime(120_000);
    focusWindow();

    // Assert
    expect(runSync).not.toHaveBeenCalled();
    expect(focusListeners.size).toBe(0);
  });
});

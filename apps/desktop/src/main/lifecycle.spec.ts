import { describe, expect, it, vi } from 'vitest';

import { detach, runShutdownSteps } from './lifecycle';

function fakeLogger() {
  return { error: vi.fn(), warn: vi.fn() };
}

describe('runShutdownSteps', () => {
  it('runs every step even when one throws', async () => {
    // Arrange
    const logger = fakeLogger();
    const ran: string[] = [];

    // Act
    const result = await runShutdownSteps(
      [
        { name: 'testing', run: () => Promise.reject(new Error('stuck adb')) },
        { name: 'collab', run: async () => void ran.push('collab') },
        { name: 'database', run: () => void ran.push('database') },
      ],
      1000,
      logger,
    );

    // Assert
    expect(ran.sort()).toEqual(['collab', 'database']);
    expect(result).toEqual({ failed: ['testing'], timedOut: [] });
    expect(logger.error).toHaveBeenCalledWith('shutdown:testing', expect.any(Error));
  });

  it('stops waiting at the deadline and names the pending steps', async () => {
    // Arrange
    vi.useFakeTimers();
    const logger = fakeLogger();

    // Act
    const running = runShutdownSteps(
      [
        { name: 'collab', run: () => new Promise(() => undefined) },
        { name: 'database', run: async () => undefined },
      ],
      500,
      logger,
    );
    await vi.advanceTimersByTimeAsync(500);
    const result = await running;
    vi.useRealTimers();

    // Assert
    expect(result.timedOut).toEqual(['collab']);
    expect(logger.warn).toHaveBeenCalledWith('shutdown', expect.stringContaining('collab'));
  });
});

describe('detach', () => {
  it('logs a rejection instead of leaving it unhandled', async () => {
    // Arrange
    const logger = fakeLogger();
    const error = new Error('sync failed');

    // Act
    detach('collab:sync', Promise.reject(error), logger);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Assert
    expect(logger.error).toHaveBeenCalledWith('collab:sync', error);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ERROR_BANNER_AUTO_DISMISS_MS,
  ErrorNotificationService,
} from './error-notification.service';

describe('ErrorNotificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses the banner after 3 seconds', () => {
    const service = new ErrorNotificationService();
    service.reportGeneric('Enter a URL before sending.');

    expect(service.banner()?.detail).toBe('Enter a URL before sending.');

    vi.advanceTimersByTime(ERROR_BANNER_AUTO_DISMISS_MS - 1);
    expect(service.banner()).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(service.banner()).toBeNull();
  });

  it('resets the auto-dismiss timer when a new error is shown', () => {
    const service = new ErrorNotificationService();
    service.reportGeneric('first');
    vi.advanceTimersByTime(ERROR_BANNER_AUTO_DISMISS_MS - 500);
    service.reportGeneric('second');

    vi.advanceTimersByTime(ERROR_BANNER_AUTO_DISMISS_MS - 1);
    expect(service.banner()?.detail).toBe('second');

    vi.advanceTimersByTime(1);
    expect(service.banner()).toBeNull();
  });

  it('clears the timer on manual dismiss', () => {
    const service = new ErrorNotificationService();
    service.reportGeneric('manual');
    service.dismiss();

    expect(service.banner()).toBeNull();
    vi.advanceTimersByTime(ERROR_BANNER_AUTO_DISMISS_MS);
    expect(service.banner()).toBeNull();
  });

  it('shows a user-facing title instead of IPC_HANDLER_FAILED', () => {
    const service = new ErrorNotificationService();
    service.reportUnknown(
      new Error(
        "Error invoking remote method 'db:query': TestrixError: DATABASE_CONNECTION_FAILED: relation \"users\" does not exist",
      ),
    );

    expect(service.banner()?.title).toBe('Database error');
    expect(service.banner()?.title).not.toMatch(/IPC/i);
    expect(service.banner()?.detail).toBe('relation "users" does not exist');
    expect(service.banner()?.detail).not.toContain('TestrixError');
    expect(JSON.stringify(service.banner())).not.toContain('IPC_HANDLER_FAILED');
  });
});

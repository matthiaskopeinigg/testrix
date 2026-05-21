import { TestBed } from '@angular/core/testing';

import { TxNotificationService } from './tx-notification.service';

describe('TxNotificationService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows and auto-dismisses a success notification', () => {
    const service = TestBed.inject(TxNotificationService);
    service.showSuccess('Settings saved', 1000);

    expect(service.active()?.message).toBe('Settings saved');
    expect(service.active()?.tone).toBe('success');

    vi.advanceTimersByTime(1000);
    expect(service.active()).toBeNull();
  });

  it('replaces an active notification when show is called again', () => {
    const service = TestBed.inject(TxNotificationService);
    service.showSuccess('First', 0);
    service.showSuccess('Second', 0);

    expect(service.active()?.message).toBe('Second');
  });
});

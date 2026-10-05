import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { idleUpdateStatus } from './update-view';
import { UpdateStore } from './update.store';
import { WhatsNewDialogComponent } from './whats-new-dialog.component';

describe('WhatsNewDialogComponent', () => {
  const whatsNewOpen = signal(false);
  const status = signal(idleUpdateStatus('2.1.0'));

  beforeEach(() => {
    whatsNewOpen.set(true);
    status.set({
      ...idleUpdateStatus('2.1.0'),
      updatedFrom: '2.0.0',
      release: {
        version: '2.1.0',
        notes: '### Added\n\n- In-app updates\n',
        releasedAt: '2026-09-01T00:00:00.000Z',
        size: 1,
      },
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UpdateStore,
          useValue: {
            whatsNewOpen,
            status,
            closeWhatsNew: vi.fn(() => whatsNewOpen.set(false)),
          },
        },
      ],
    });
  });

  it('renders notes for the version that just installed', () => {
    const fixture = TestBed.createComponent(WhatsNewDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("What's new in Testrix 2.1.0");
    expect(text).toContain('Updated from 2.0.0');
    expect(text).toContain('In-app updates');
  });

  it('stays closed when What’s new is not open', () => {
    whatsNewOpen.set(false);
    const fixture = TestBed.createComponent(WhatsNewDialogComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});

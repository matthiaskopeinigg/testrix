import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { idleUpdateStatus } from './update-view';
import { UpdateSettingsPaneComponent } from './update-settings-pane.component';
import { UpdateStore } from './update.store';

const RELEASE = { version: '2.1.0', notes: '', releasedAt: '2026-09-01T00:00:00.000Z', size: 1 };

describe('UpdateSettingsPaneComponent', () => {
  const status = signal(idleUpdateStatus('2.0.0'));

  beforeEach(() => {
    status.set({ ...idleUpdateStatus('2.0.0'), isSupported: true });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UpdateStore,
          useValue: {
            status,
            isBusy: signal(false),
            downloadAndInstall: vi.fn(),
            install: vi.fn(),
            check: vi.fn(),
            setChannel: vi.fn(),
            setAutoCheck: vi.fn(),
            setAutoDownload: vi.fn(),
          },
        },
      ],
    });
  });

  it('explains why a development build cannot update', () => {
    status.set({
      ...idleUpdateStatus('2.0.0'),
      isSupported: false,
      unsupportedReason: 'Development builds do not update themselves.',
    });
    const fixture = TestBed.createComponent(UpdateSettingsPaneComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Development builds do not update themselves.');
    expect(fixture.nativeElement.textContent).not.toContain('Download & Install');
  });

  it('offers Download & Install while a release is waiting', () => {
    status.set({
      ...idleUpdateStatus('2.0.0'),
      isSupported: true,
      phase: 'available',
      release: RELEASE,
    });
    const fixture = TestBed.createComponent(UpdateSettingsPaneComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Testrix 2.1.0 is available.');
    expect(fixture.nativeElement.textContent).toContain('Download & Install');
  });

  it('shows a download meter and hides the install action while bytes arrive', () => {
    status.set({
      ...idleUpdateStatus('2.0.0'),
      isSupported: true,
      phase: 'downloading',
      percent: 40,
      release: RELEASE,
    });
    const fixture = TestBed.createComponent(UpdateSettingsPaneComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Downloading Testrix 2.1.0… 40%');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Check now');
  });

  it('offers Install update when the file is ready', () => {
    status.set({
      ...idleUpdateStatus('2.0.0'),
      isSupported: true,
      phase: 'ready',
      release: RELEASE,
    });
    const fixture = TestBed.createComponent(UpdateSettingsPaneComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Install update');
  });
});

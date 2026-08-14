import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import type { UpdaterStatus } from '@shared/updater/updater-status.schema';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { UpdateService } from '@app/core/updater/update.service';
import { createDefaultSettings } from '@shared/config';

import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxUpdateBannerComponent } from './tx-update-banner.component';

describe('TxUpdateBannerComponent', () => {
  let fixture: ComponentFixture<TxUpdateBannerComponent>;

  const status = signal<UpdaterStatus>({ state: 'idle', info: null });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxUpdateBannerComponent],
      providers: [
        {
          provide: UpdateService,
          useValue: {
            status,
            ignoreCurrentOffer: () => Promise.resolve(),
            downloadAndInstall: () => Promise.resolve(),
            openReleaseNotes: vi.fn(),
          },
        },
        {
          provide: ElectronService,
          useValue: {
            bridge: () => ({ versions: { app: '0.1.0' } }),
          },
        },
        ConfigService,
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M12 3v12"/>'),
          },
        },
      ],
    }).compileComponents();

    const config = TestBed.inject(ConfigService);
    config.syncSettings(createDefaultSettings());

    fixture = TestBed.createComponent(TxUpdateBannerComponent);
    fixture.componentRef.setInput('visible', true);
  });

  it('renders update available copy', async () => {
    status.set({ state: 'available', info: { version: '0.2.0' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Update available');
    expect(el.textContent).toContain('0.2.0');
    expect(el.textContent).toContain('View release notes');
    expect(el.textContent).toContain('Download and install');
    expect(el.textContent).toContain('Dismiss');
  });

  it('shows transfer stats while downloading', async () => {
    status.set({
      state: 'downloading',
      info: {
        version: '0.2.0-sim',
        percent: 40,
        bytesPerSecond: 1_100_000,
        transferred: 4_600_000,
        total: 11_000_000,
        devPreviewOnly: true,
      },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Downloading update');
    expect(el.textContent).toContain('simulated transfer');
    expect(el.textContent).toContain('MB');
  });
});

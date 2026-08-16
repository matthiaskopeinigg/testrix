import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { ProfileService } from '@app/core/profile/profile.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { ThemeService } from '@app/core/theme/theme.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { UpdateBannerContextService } from '@app/core/updater/update-banner-context.service';
import { UpdateService } from '@app/core/updater/update.service';
import { createDefaultSettings } from '@shared/config';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { TxSettingsPopupComponent } from './tx-settings-popup.component';

async function createAboutFixture(bridge: object | null): Promise<ComponentFixture<TxSettingsPopupComponent>> {
  await TestBed.configureTestingModule({
    imports: [TxSettingsPopupComponent],
    providers: [
      {
        provide: ConfigService,
        useValue: {
          settings: signal(createDefaultSettings()),
          patchSettings: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: ElectronService, useValue: { bridge: () => bridge } },
      {
        provide: ProfileService,
        useValue: {
          profiles: signal([]),
          activeProfileId: signal(null),
          activeProfile: computed(() => null),
          hydrate: vi.fn(),
        },
      },
      { provide: TxNotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: ThemeService, useValue: { activeThemeId: signal('default') } },
      {
        provide: UiPreferencesService,
        useValue: {
          entranceStaggerEnabled: computed(() => false),
          showIconTooltips: computed(() => false),
        },
      },
      { provide: UpdateService, useValue: { status: signal({ state: 'idle', info: null }) } },
      {
        provide: UpdateBannerContextService,
        useValue: { setUpdatesPanelActive: vi.fn() },
      },
      {
        provide: TxIconService,
        useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(TxSettingsPopupComponent);
  fixture.componentRef.setInput('open', true);
  fixture.componentInstance['selectSection']('about');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('TxSettingsPopupComponent about section', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('shows the installed app version from the Electron bridge', async () => {
    const versions = {
      app: '1.0.0-beta.1',
      installedApp: '1.0.0-beta.1',
      electron: '42.1.0',
      chrome: '140.0.0',
    };
    const fixture = await createAboutFixture({
      platform: 'win32',
      versions,
      getVersions: () => versions,
      devToolkit: false,
      config: { getConfigDir: () => Promise.resolve('C:\\\\testrix') },
    });

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Version 1.0.0-beta.1');
    expect(text).toContain('Application');
    expect(text).toContain('1.0.0-beta.1');
    expect(text).toContain('no Stable GitHub release');
    expect(text).not.toContain('Version (dev)');
  });

  it('prefers the installed build over a simulated updater version', async () => {
    const versions = {
      app: '9.9.9-sim',
      installedApp: '1.0.0-beta.1',
      electron: '42.1.0',
      chrome: '140.0.0',
    };
    const fixture = await createAboutFixture({
      platform: 'win32',
      versions,
      getVersions: () => versions,
      devToolkit: false,
      config: { getConfigDir: () => Promise.resolve('C:\\\\testrix') },
    });

    expect(fixture.nativeElement.textContent).toContain('Version 1.0.0-beta.1');
    expect(fixture.nativeElement.textContent).not.toContain('9.9.9-sim');
  });

  it('does not leave a blank application version when preload values are empty', async () => {
    const versions = { app: '', installedApp: '', electron: '42.1.0', chrome: '140.0.0' };
    const fixture = await createAboutFixture({
      platform: 'win32',
      versions,
      getVersions: () => versions,
      devToolkit: false,
      config: { getConfigDir: () => Promise.resolve('C:\\\\testrix') },
    });

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Version (dev)');
    expect(text).toContain('—');
  });
});

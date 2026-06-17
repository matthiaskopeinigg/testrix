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

describe('TxSettingsPopupComponent http request section', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  it('renders request settings when section is active', async () => {
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
        { provide: ElectronService, useValue: { bridge: () => null } },
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
        { provide: UpdateService, useValue: { status: signal(null) } },
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

    const fixture: ComponentFixture<TxSettingsPopupComponent> = TestBed.createComponent(TxSettingsPopupComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentInstance['selectSection']('httpRequest');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Default HTTP method');
    expect(text).toContain('Default response tab after send');
    expect(text).toContain('Timeout');
    expect(text).toContain('Follow redirects');
    expect(text).toContain('Enable HTTP/2');
  });
});

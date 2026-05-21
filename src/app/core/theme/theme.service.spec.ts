import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DEFAULT_APPEARANCE_THEME_ID } from '@shared/theme';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let syncSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    syncSettings = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        {
          provide: ConfigService,
          useValue: {
            settings: () => ({
              appearance: { theme: DEFAULT_APPEARANCE_THEME_ID, density: 'comfortable' },
            }),
            syncSettings,
          },
        },
        {
          provide: ElectronService,
          useValue: { bridge: () => null },
        },
      ],
    });

    service = TestBed.inject(ThemeService);
  });

  it('applies resolved palette class for catalog themes', () => {
    service.loadTheme('dracula');
    expect(document.body.classList.contains('theme-dracula')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('maps legacy system theme to GitHub Light', () => {
    service.loadTheme('system');
    expect(document.body.classList.contains('theme-github-light')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(service.theme()).toBe('github-light');
  });

  it('persists theme via config sync in browser harness', async () => {
    await service.setTheme('nord', true, { animate: false });
    expect(syncSettings).toHaveBeenCalled();
    expect(service.theme()).toBe('nord');
  });
});

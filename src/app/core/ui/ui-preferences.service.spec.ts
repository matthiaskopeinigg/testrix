import { TestBed } from '@angular/core/testing';

import { createDefaultSettings } from '@shared/config';

import { ConfigService } from '../config/config.service';
import { UiPreferencesService } from './ui-preferences.service';

describe('UiPreferencesService', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-animation-speed', 'normal');
    document.documentElement.setAttribute('data-tooltips', 'enabled');
    document.documentElement.setAttribute('data-chrome-blur', 'enabled');

    TestBed.configureTestingModule({
      providers: [
        UiPreferencesService,
        {
          provide: ConfigService,
          useValue: {
            settings: () => ({
              ...createDefaultSettings(),
              ui: {
                ...createDefaultSettings().ui,
                animationSpeed: 'none',
                showIconTooltips: false,
              },
            }),
          },
        },
      ],
    });
  });

  it('mirrors ui flags onto the document element', () => {
    const service = TestBed.inject(UiPreferencesService);
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-animation-speed')).toBe('none');
    expect(document.documentElement.getAttribute('data-tooltips')).toBe('disabled');
    expect(service.animationsEnabled()).toBe(false);
  });
});

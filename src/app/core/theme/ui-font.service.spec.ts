import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { ConfigService } from '../config/config.service';
import { ElectronService } from '../electron/electron.service';
import { UiFontService } from './ui-font.service';

describe('UiFontService', () => {
  let service: UiFontService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UiFontService,
        {
          provide: ConfigService,
          useValue: { settings: () => null, patchSettings: async () => {} },
        },
        { provide: ElectronService, useValue: { bridge: () => null } },
      ],
    });
    service = TestBed.inject(UiFontService);
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-ui-font');
    document.documentElement.removeAttribute('data-ui-font-size');
    document.documentElement.removeAttribute('data-ui-font-weight');
    document.documentElement.removeAttribute('data-ui-line-height');
    document.getElementById('tx-ui-font-stylesheet')?.remove();
  });

  it('applies CSS variables and data attribute', () => {
    service.loadAppearanceTypography({
      uiFont: 'poppins',
      uiFontSize: 'large',
      uiFontWeight: 'bold',
      uiLineHeight: 'relaxed',
    });
    expect(document.documentElement.getAttribute('data-ui-font')).toBe('poppins');
    expect(document.documentElement.getAttribute('data-ui-font-size')).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--tx-font-body')).toContain('Poppins');
    expect(document.documentElement.style.getPropertyValue('--tx-ui-font-weight-body')).toBe('700');
    const link = document.getElementById('tx-ui-font-stylesheet') as HTMLLinkElement | null;
    expect(link?.getAttribute('href')).toContain('Poppins');
  });
});

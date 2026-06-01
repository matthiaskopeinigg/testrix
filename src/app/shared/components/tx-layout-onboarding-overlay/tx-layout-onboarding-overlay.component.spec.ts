import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { ThemeService } from '@app/core/theme/theme.service';
import { createDefaultSettings } from '@shared/config';
import { TxIconService } from '../../icons/tx-icon.service';

import { TxLayoutOnboardingOverlayComponent } from './tx-layout-onboarding-overlay.component';

describe('TxLayoutOnboardingOverlayComponent', () => {
  let fixture: ComponentFixture<TxLayoutOnboardingOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TxLayoutOnboardingOverlayComponent],
      providers: [
        {
          provide: ConfigService,
          useValue: { settings: signal(createDefaultSettings()) },
        },
        {
          provide: ThemeService,
          useValue: { loadTheme: vi.fn() },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TxLayoutOnboardingOverlayComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
  });

  it('starts on the theme selection step', () => {
    const title = fixture.nativeElement.querySelector('#tx-layout-onboarding-title');
    expect(title?.textContent?.trim()).toContain('Choose your theme');
  });

  it('advances to layout step after theme continue', () => {
    const continueButton = fixture.nativeElement.querySelector('tx-button button');
    continueButton?.click();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('#tx-layout-onboarding-title');
    expect(title?.textContent?.trim()).toContain('Choose your workspace layout');
  });

  it('emits theme and titlebar layout when onboarding completes', () => {
    const emitSpy = vi.fn();
    fixture.componentInstance.onboardingCompleted.subscribe(emitSpy);

    fixture.componentInstance['handleContinueThemeStep']();
    fixture.detectChanges();

    const tabsOption = fixture.nativeElement.querySelectorAll('.tx-layout-onboarding-overlay__option')[1];
    tabsOption?.click();
    fixture.detectChanges();

    const finishButton = fixture.nativeElement.querySelector('tx-button button');
    finishButton?.click();
    fixture.detectChanges();

    expect(emitSpy).toHaveBeenCalledWith({
      theme: 'github-light',
      layout: 'titlebar',
    });
  });
});

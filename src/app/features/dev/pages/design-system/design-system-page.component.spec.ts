import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { DesignSystemSessionService } from '@app/core/design-system/design-system-session.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { createDefaultWorkspaceDesignSystem } from '@shared/config';

import { DesignSystemPageComponent } from './design-system-page.component';

describe('DesignSystemPageComponent', () => {
  const sessionMock = {
    load: vi.fn(),
    get: vi.fn(() => null),
    getDefault: vi.fn(() => {
      const defaults = createDefaultWorkspaceDesignSystem();
      return {
        activePillar: defaults.activePillar,
        activeSectionId: defaults.activeSectionId,
        expandedPillars: defaults.expandedPillars,
        debugEnabled: defaults.debugEnabled,
      };
    }),
    patch: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [DesignSystemPageComponent],
      providers: [
        provideRouter([]),
        { provide: DesignSystemSessionService, useValue: sessionMock },
        {
          provide: ElectronService,
          useValue: {
            isDevToolkit: () => true,
            bridge: () => Promise.resolve(null),
          },
        },
        {
          provide: UiPreferencesService,
          useValue: {
            closeSidebarPanelOnOutsideClick: signal(false),
            entranceStaggerEnabled: computed(() => false),
          },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<circle cx="12" cy="12" r="3"/>'),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders category navigation in the design system sidebar', () => {
    const fixture = TestBed.createComponent(DesignSystemPageComponent);
    fixture.detectChanges();

    const categories = fixture.nativeElement.querySelectorAll('.ds-cat');
    expect(categories.length).toBeGreaterThanOrEqual(5);
  });

  it('renders section tabs for the active category', () => {
    const fixture = TestBed.createComponent(DesignSystemPageComponent);
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('.ds-layout__section-tab');
    expect(tabs.length).toBeGreaterThan(0);
  });

  it('toggleCategoryExpanded persists expanded pillars without changing canvas', () => {
    const fixture = TestBed.createComponent(DesignSystemPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.activePillar()).toBe('style-guide');
    sessionMock.patch.mockClear();

    const categories = fixture.nativeElement.querySelectorAll('.ds-cat');
    let brandCategory: HTMLElement | undefined;
    for (const el of categories) {
      if ((el as HTMLElement).querySelector('.ds-cat__label')?.textContent?.includes('Brand')) {
        brandCategory = el as HTMLElement;
        break;
      }
    }
    const expandBtn = brandCategory?.querySelector('.ds-cat__expand') as HTMLButtonElement | null;
    expandBtn?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activePillar()).toBe('style-guide');
    expect(sessionMock.patch).toHaveBeenCalledWith(
      expect.objectContaining({ expandedPillars: expect.any(Array) }),
    );
  });

  it('selectCategory updates canvas and persists', () => {
    const fixture = TestBed.createComponent(DesignSystemPageComponent);
    fixture.detectChanges();

    const categories = fixture.nativeElement.querySelectorAll('.ds-cat');
    let brandCategory: HTMLElement | undefined;
    for (const el of categories) {
      if ((el as HTMLElement).querySelector('.ds-cat__label')?.textContent?.includes('Brand')) {
        brandCategory = el as HTMLElement;
        break;
      }
    }
    const selectBtn = brandCategory?.querySelector('.ds-cat__select') as HTMLButtonElement | null;
    selectBtn?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.activePillar()).toBe('brand');
    expect(fixture.componentInstance.activeSectionId()).toBe('brand-identity');
    expect(sessionMock.patch).toHaveBeenCalled();
  });
});

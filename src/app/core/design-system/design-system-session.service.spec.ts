import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ConfigService } from '@app/core/config/config.service';
import { createDefaultSession } from '@shared/config';

import {
  DesignSystemSessionService,
  isValidDesignSystemViewState,
  sectionIdForPillar,
} from './design-system-session.service';

describe('DesignSystemSessionService', () => {
  let service: DesignSystemSessionService;
  let patchSession: ReturnType<typeof vi.fn>;
  let sessionState: ReturnType<typeof signal<ReturnType<typeof createDefaultSession>>>;

  beforeEach(async () => {
    sessionStorage.clear();
    patchSession = vi.fn().mockResolvedValue(undefined);
    sessionState = signal(createDefaultSession());

    await TestBed.configureTestingModule({
      providers: [
        DesignSystemSessionService,
        {
          provide: ConfigService,
          useValue: {
            session: sessionState.asReadonly(),
            patchSession,
          },
        },
      ],
    }).compileComponents();

    service = TestBed.inject(DesignSystemSessionService);
    service.load();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('reads valid state from the session workspace slice', () => {
    const view = service.get();
    expect(view?.activePillar).toBe('style-guide');
    expect(view?.activeSectionId).toBe('sg-typography');
    expect(view?.expandedPillars.length).toBeGreaterThan(0);

    const defaults = service.getDefault();
    expect(defaults.activePillar).toBe('style-guide');
    expect(defaults.activeSectionId).toBe('sg-typography');
  });

  it('patch persists valid state via ConfigService', () => {
    service.patch({
      activePillar: 'brand',
      activeSectionId: 'brand-identity',
      debugEnabled: true,
      expandedPillars: ['brand', 'components'],
    });

    expect(patchSession).toHaveBeenCalledWith({
      workspace: {
        designSystem: {
          activePillar: 'brand',
          activeSectionId: 'brand-identity',
          debugEnabled: true,
          expandedPillars: ['brand', 'components'],
        },
      },
    });
  });

  it('rejects invalid section ids', () => {
    service.patch({ activeSectionId: 'not-a-real-section' });
    expect(patchSession).not.toHaveBeenCalled();
  });

  it('imports legacy sessionStorage once', () => {
    sessionStorage.setItem(
      'testrix.designSystemViewState',
      JSON.stringify({
        activePillar: 'components',
        activeSectionId: 'comp-button',
        debugEnabled: true,
      }),
    );

    const freshPatch = vi.fn().mockResolvedValue(undefined);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        DesignSystemSessionService,
        {
          provide: ConfigService,
          useValue: {
            session: sessionState.asReadonly(),
            patchSession: freshPatch,
          },
        },
      ],
    });

    const fresh = TestBed.inject(DesignSystemSessionService);
    fresh.load();

    expect(freshPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: {
          designSystem: expect.objectContaining({
            activePillar: 'components',
            activeSectionId: 'comp-button',
            debugEnabled: true,
          }),
        },
      }),
    );
    expect(sessionStorage.getItem('testrix.designSystemViewState')).toBeNull();
  });
});

describe('isValidDesignSystemViewState', () => {
  it('accepts known pillar, section, and expanded pillars', () => {
    expect(
      isValidDesignSystemViewState({
        activePillar: 'components',
        activeSectionId: 'comp-button',
        expandedPillars: ['components', 'brand'],
        debugEnabled: false,
      }),
    ).toBe(true);
  });

  it('rejects unknown pillar', () => {
    expect(
      isValidDesignSystemViewState({
        activePillar: 'unknown' as 'style-guide',
        activeSectionId: 'sg-typography',
        expandedPillars: ['style-guide'],
        debugEnabled: false,
      }),
    ).toBe(false);
  });
});

describe('sectionIdForPillar', () => {
  it('returns first section when preferred is invalid', () => {
    expect(sectionIdForPillar('brand', 'invalid')).toBe('brand-identity');
  });
});

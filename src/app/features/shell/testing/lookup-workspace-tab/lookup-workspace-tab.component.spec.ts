import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { createDefaultSession, createDefaultSettings } from '@shared/config';
import { createLookupDefinition } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { DatabaseQueriesService } from '@app/core/database/database-queries.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { LookupService } from '@app/core/testing/lookup.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { LookupWorkspaceTabComponent } from './lookup-workspace-tab.component';

describe('LookupWorkspaceTabComponent', () => {
  let fixture: ComponentFixture<LookupWorkspaceTabComponent>;
  const lookup = createLookupDefinition('lk-1', 'Customer');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LookupWorkspaceTabComponent],
      providers: [
        {
          provide: LookupService,
          useValue: {
            find: () => lookup,
            labelForResource: () => lookup.name,
            hydrate: vi.fn().mockResolvedValue(undefined),
            patchLookup: vi.fn(),
            run: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            settings: () => createDefaultSettings(),
            session: () => createDefaultSession(),
            sessionRevision: () => 0,
            patchSession: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TestingSessionService,
          useValue: {
            navigationFields: () => ({ activeView: 'menu', subpanel: 'lookups' }),
          },
        },
        {
          provide: EnvironmentsService,
          useValue: {
            environments: () => [],
            hydrate: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DatabaseQueriesService,
          useValue: {
            nodes: () => [],
            find: vi.fn(),
            hydrate: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UiPreferencesService,
          useValue: {
            entranceStaggerEnabled: () => false,
            animationsEnabled: () => false,
          },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LookupWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'lk:lk-1');
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});

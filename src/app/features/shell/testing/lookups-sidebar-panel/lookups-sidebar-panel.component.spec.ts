import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LookupsSidebarPanelComponent } from './lookups-sidebar-panel.component';

import { LookupService } from '@app/core/testing/lookup.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

describe('LookupsSidebarPanelComponent', () => {
  let fixture: ComponentFixture<LookupsSidebarPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LookupsSidebarPanelComponent],
      providers: [
        {
          provide: LookupService,
          useValue: {
            lookups: () => [],
            hydrate: vi.fn().mockResolvedValue(undefined),
            createLookup: vi.fn(),
            patchLookup: vi.fn(),
            deleteLookup: vi.fn(),
            find: vi.fn(),
            tabResourceId: (id: string) => `lk:${id}`,
          },
        },
        {
          provide: TestingSessionService,
          useValue: {
            load: vi.fn(),
            backToTestingMenu: vi.fn(),
          },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { activeTab: () => null, openResource: vi.fn(), closeTabsForResourceIds: vi.fn() },
        },
        {
          provide: WorkspaceSidebarPanelHeaderService,
          useValue: { set: vi.fn(), clear: vi.fn() },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LookupsSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});

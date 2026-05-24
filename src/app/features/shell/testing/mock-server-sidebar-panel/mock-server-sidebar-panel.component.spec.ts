import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { MockServerSidebarPanelComponent } from './mock-server-sidebar-panel.component';
import { createDefaultSession, createDefaultSettings } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

describe('MockServerSidebarPanelComponent', () => {
  let fixture: ComponentFixture<MockServerSidebarPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MockServerSidebarPanelComponent],
      providers: [
        {
          provide: MockServerService,
          useValue: {
            running: () => false,
            options: () => ({
              port: 'auto',
              delayMs: 0,
              host: '127.0.0.1',
              cors: { enabled: false, allowOrigin: '*', allowMethods: '*', allowHeaders: '*' },
              captureToHistory: false,
              captureMismatchesToHistory: false,
              autoStartOnLaunch: false,
            }),
            status: () => null,
            mismatches: () => [],
            unmatchedCount: () => 0,
            nodes: () => [],
            allTags: () => [],
            start: vi.fn(),
            stop: vi.fn(),
            updateOptions: vi.fn(),
            addFolder: vi.fn(),
            addEndpoint: vi.fn().mockReturnValue({ id: 'e1' }),
            clearMismatches: vi.fn(),
            hydrate: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            session: () => createDefaultSession(),
            settings: () => createDefaultSettings(),
            sessionRevision: () => 0,
            patchSession: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TestingSessionService,
          useValue: {
            load: vi.fn(),
            navigationFields: () => ({ activeView: 'menu', subpanel: 'mock-server' }),
            backToTestingMenu: vi.fn(),
          },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { activeTab: () => null, openResource: vi.fn() },
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

    fixture = TestBed.createComponent(MockServerSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});

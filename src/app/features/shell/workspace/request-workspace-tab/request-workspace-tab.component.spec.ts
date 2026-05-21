import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { createDefaultSession, createDefaultSettings } from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { HttpRequestService } from '@app/core/http/http-request.service';
import { HistoryService } from '@app/core/history/history.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { COLLECTION_TREE_MOCK } from '@app/features/shell/collections/collection-tree.mock';

import { RequestWorkspaceTabComponent } from './request-workspace-tab.component';

describe('RequestWorkspaceTabComponent', () => {
  let fixture: ComponentFixture<RequestWorkspaceTabComponent>;
  let patchRequestSettings: ReturnType<typeof vi.fn>;
  let patchSession: ReturnType<typeof vi.fn>;
  let bindRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    patchRequestSettings = vi.fn().mockReturnValue(true);
    patchSession = vi.fn().mockResolvedValue(undefined);
    bindRequest = vi.fn();

    await TestBed.configureTestingModule({
      imports: [RequestWorkspaceTabComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: () => COLLECTION_TREE_MOCK,
            patchRequestSettings,
            updateRequest: vi.fn().mockReturnValue(true),
            setRequestDescription: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: EnvironmentsService,
          useValue: { environments: () => [] },
        },
        {
          provide: HistoryService,
          useValue: { nodes: () => [] },
        },
        {
          provide: HttpRequestService,
          useValue: {
            bindRequest,
            boundRequestId: () => null,
            inFlight: () => false,
            runs: () => [],
            selectedSnapshot: () => null,
            lastDiff: () => null,
            pinnedBaselineId: () => null,
            activeResponseTab: () => 'body',
          },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { openResource: vi.fn() },
        },
        {
          provide: UiPreferencesService,
          useValue: {
            entranceStaggerEnabled: () => false,
            animationsEnabled: () => false,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            session: () => createDefaultSession(),
            settings: () => createDefaultSettings(),
            sessionRevision: () => 0,
            patchSession,
          },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RequestWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'req-login');
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('bindRequest runs only when the tab is active', () => {
    bindRequest.mockClear();
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    expect(bindRequest).not.toHaveBeenCalled();

    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    expect(bindRequest).toHaveBeenCalledWith('req-login');
  });

  it('renders sidebar section nav by default', () => {
    expect(fixture.nativeElement.querySelector('.request-tab__nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#request-section')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.request-tab__sections-wrap')).toBeFalsy();
  });

  it('persists active section to session', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSectionSelect']('params');
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(patchSession).toHaveBeenCalledWith({
      workspace: {
        collections: {
          requestTabsById: {
            'req-login': {
              activeSection: 'params',
              activeScriptPane: 'pre',
            },
          },
        },
      },
    });
    vi.useRealTimers();
  });

  it('patches settings when query params change', () => {
    fixture.componentInstance['handleSettingsPatch']({
      queryParams: [
        { id: 'q1', enabled: true, key: 'page', value: '1' },
      ],
    });
    expect(patchRequestSettings).toHaveBeenCalledWith('req-login', {
      queryParams: [{ id: 'q1', enabled: true, key: 'page', value: '1' }],
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { createDefaultSession, createDefaultSettings } from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { COLLECTION_TREE_MOCK } from '@app/features/shell/collections/collection-tree.mock';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { WebsocketWorkspaceTabComponent } from './websocket-workspace-tab.component';

describe('WebsocketWorkspaceTabComponent', () => {
  let fixture: ComponentFixture<WebsocketWorkspaceTabComponent>;
  let patchWebsocketSettings: ReturnType<typeof vi.fn>;
  let updateWebsocket: ReturnType<typeof vi.fn>;
  let patchSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    patchWebsocketSettings = vi.fn().mockReturnValue(true);
    updateWebsocket = vi.fn().mockReturnValue(true);
    patchSession = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [WebsocketWorkspaceTabComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: () => COLLECTION_TREE_MOCK,
            patchWebsocketSettings,
            updateWebsocket,
            setWebsocketDescription: vi.fn().mockReturnValue(true),
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
          provide: EnvironmentsService,
          useValue: { environments: () => [] },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { openResource: vi.fn() },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WebsocketWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'ws-auth-status');
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
  });

  it('renders workspace tab chrome and Connect button', () => {
    expect(fixture.nativeElement.querySelector('.ws-tab.tx-workspace-tab')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Connect');
    expect(fixture.nativeElement.querySelector('#ws-url')).toBeTruthy();
  });

  it('shows missing banner when resource is absent', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [WebsocketWorkspaceTabComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: () => COLLECTION_TREE_MOCK,
            patchWebsocketSettings,
            updateWebsocket,
            setWebsocketDescription: vi.fn().mockReturnValue(true),
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
          provide: EnvironmentsService,
          useValue: { environments: () => [] },
        },
        {
          provide: WorkspaceEditorService,
          useValue: { openResource: vi.fn() },
        },
        {
          provide: TxIconService,
          useValue: { loadIconInner: () => Promise.resolve('<path d="M0 0"/>') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WebsocketWorkspaceTabComponent);
    fixture.componentRef.setInput('resourceId', 'missing-ws');
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('WebSocket not found');
  });

  it('renders sidebar section nav by default', () => {
    expect(fixture.nativeElement.querySelector('.ws-tab__nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ws-tab__sections-wrap')).toBeFalsy();
  });

  it('persists active section to session', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSectionSelect']('headers');
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(patchSession).toHaveBeenCalledWith({
      workspace: {
        collections: {
          websocketTabsById: {
            'ws-auth-status': {
              activeSection: 'headers',
              activeScriptPane: 'pre',
              messagesPanelHeightPx: 320,
              isMessagesPanelHidden: false,
            },
          },
        },
      },
    });
    vi.useRealTimers();
  });

  it('updates wsPath from toolbar input', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleWsPathChange']('ws://example.com/live');
    vi.advanceTimersByTime(350);
    expect(updateWebsocket).toHaveBeenCalledWith('ws-auth-status', {
      wsPath: 'ws://example.com/live',
    });
    vi.useRealTimers();
  });

  it('shows messages panel placeholder when disconnected', () => {
    expect(fixture.nativeElement.querySelector('app-ws-tab-messages-panel')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Connect to view sent and received WebSocket messages');
  });

  it('toggles Connect to Disconnect on stub connect', () => {
    const button = fixture.nativeElement.querySelector('tx-button');
    expect(button?.textContent?.trim()).toBe('Connect');
    fixture.componentInstance['handleConnectToggle']();
    fixture.detectChanges();
    expect(button?.textContent?.trim()).toBe('Disconnect');
  });

  it('shows connected empty state in messages panel after connect', () => {
    fixture.componentInstance['handleConnectToggle']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connected — sent and received messages will appear here');
  });

  it('renders websocket settings panel without HTTP transport toggles', () => {
    fixture.componentInstance['handleSectionSelect']('settings');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Handshake timeout');
    expect(fixture.nativeElement.textContent).toContain('Strict SSL');
    expect(fixture.nativeElement.textContent).not.toContain('Follow redirects');
    expect(fixture.nativeElement.textContent).not.toContain('HTTP/2');
  });

  it('shows websocket script pane labels', () => {
    fixture.componentInstance['handleSectionSelect']('scripts');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Before connect');
    expect(fixture.nativeElement.textContent).toContain('On message');
    expect(fixture.nativeElement.textContent).not.toContain('Pre-request');
    expect(fixture.nativeElement.textContent).not.toContain('Post-response');
  });
});

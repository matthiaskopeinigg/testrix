import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SessionFile } from '@shared/config';
import { createDefaultSession } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { WorkspaceSidebarSessionService } from './workspace-sidebar-session.service';

describe('WorkspaceSidebarSessionService', () => {
  let service: WorkspaceSidebarSessionService;
  const sessionState = signal<SessionFile | null>(createDefaultSession());

  beforeEach(() => {
    sessionState.set(createDefaultSession());

    TestBed.configureTestingModule({
      providers: [
        WorkspaceSidebarSessionService,
        {
          provide: ConfigService,
          useValue: {
            session: sessionState.asReadonly(),
            patchSession: vi.fn(async (patch: { workspace?: Record<string, unknown> }) => {
              const current = sessionState()!;
              sessionState.set({
                ...current,
                workspace: {
                  ...current.workspace,
                  ...patch.workspace,
                },
              });
              return sessionState();
            }),
          },
        },
      ],
    });

    service = TestBed.inject(WorkspaceSidebarSessionService);
  });

  it('restores persisted sidebar panel from session', () => {
    const session = createDefaultSession();
    sessionState.set({
      ...session,
      workspace: {
        ...session.workspace,
        activeSidebarPanelId: 'testing',
        sidebarPanelOpen: true,
      },
    });

    service.load();
    expect(service.activeSidebarPanelId()).toBe('testing');
    expect(service.sidebarPanelOpen()).toBe(true);
  });

  it('persists sidebar panel selection', async () => {
    service.load();
    service.setActiveSidebarPanelId('testing');
    service.setSidebarPanelOpen(true);
    await service.flushPending();

    expect(sessionState()?.workspace.activeSidebarPanelId).toBe('testing');
    expect(sessionState()?.workspace.sidebarPanelOpen).toBe(true);
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { SessionFile } from '@shared/config';
import { createDefaultSession } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { TestingSessionService } from './testing-session.service';

describe('TestingSessionService', () => {
  let service: TestingSessionService;
  const sessionState = signal<SessionFile | null>(createDefaultSession());
  const sessionRevisionState = signal(0);

  beforeEach(() => {
    sessionState.set(createDefaultSession());
    sessionRevisionState.set(0);

    TestBed.configureTestingModule({
      providers: [
        TestingSessionService,
        {
          provide: ConfigService,
          useValue: {
            session: sessionState.asReadonly(),
            sessionRevision: sessionRevisionState.asReadonly(),
            patchSession: vi.fn(async (patch: { workspace?: { testing?: Record<string, unknown> } }) => {
              const current = sessionState()!;
              const testing = {
                ...current.workspace.testing,
                ...patch.workspace?.testing,
              };
              sessionState.set({
                ...current,
                workspace: {
                  ...current.workspace,
                  testing: testing as SessionFile['workspace']['testing'],
                },
              });
              sessionRevisionState.update((n) => n + 1);
              return sessionState();
            }),
          },
        },
      ],
    });

    service = TestBed.inject(TestingSessionService);
  });

  it('keeps drill-in view when navigationFields are spread into prefs patches', () => {
    service.setActiveView('test-suite');
    expect(service.activeView()).toBe('test-suite');

    const fields = service.navigationFields();
    expect(fields).toEqual({ activeView: 'test-suite', subpanel: 'menu' });
  });

  it('only returns to hub menu when backToTestingMenu is called', () => {
    service.setActiveView('test-suite');
    service.backToTestingMenu();
    expect(service.activeView()).toBe('menu');
    expect(service.subpanel()).toBe('menu');
  });

  it('restores regression drill-in from legacy subpanel on load', () => {
    const session = createDefaultSession();
    sessionState.set({
      ...session,
      workspace: {
        ...session.workspace,
        testing: {
          ...session.workspace.testing,
          activeView: 'menu',
          subpanel: 'regression',
        },
      },
    });

    service.load();
    expect(service.activeView()).toBe('regression');
    expect(service.subpanel()).toBe('menu');
  });
});

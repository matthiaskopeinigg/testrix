import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { localCollabStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { SessionPersistenceService } from '../core/session-persistence.service';
import { ShellStateService } from '../core/shell-state.service';
import { CollabStore } from '../features/collab/collab.store';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';

describe('WorkspaceSwitcherComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspacesStore,
          useValue: {
            items: signal([{ id: 'ws_1', name: 'Default', folder: 'ws_1', modifiedAt: '2026-01-01T00:00:00.000Z' }]),
            active: signal({ id: 'ws_1', name: 'Default', folder: 'ws_1', modifiedAt: '2026-01-01T00:00:00.000Z' }),
            switchTo: () => Promise.resolve(null),
          },
        },
        { provide: SessionPersistenceService, useValue: { applyActiveWorkspace: () => undefined } },
        { provide: ShellStateService, useValue: { workspaceManagerOpen: signal(false), openWorkspaceManager: () => undefined, playScene: () => undefined } },
        {
          provide: CollabStore,
          useValue: {
            repos: signal([]),
            status: signal(localCollabStatus()),
            statusLine: signal('Only on this PC'),
            openDock: () => undefined,
            openConnect: () => undefined,
            openAddFromRepo: () => undefined,
          },
        },
      ],
    });
  });

  it('shows the active workspace name', () => {
    const fixture = TestBed.createComponent(WorkspaceSwitcherComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Default');
  });
});

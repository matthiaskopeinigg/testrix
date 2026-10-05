import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { localCollabStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollabStore } from '../collab/collab.store';
import { WorkspaceManagerComponent } from './workspace-manager.component';
import { WorkspacesStore } from './workspaces.store';

const workspace = {
  id: 'ws_1',
  name: 'Default',
  folder: 'ws_1',
  modifiedAt: '2026-01-01T00:00:00.000Z',
};

describe('WorkspaceManagerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspacesStore,
          useValue: {
            items: signal([workspace]),
            active: signal(workspace),
            switchTo: () => Promise.resolve(null),
            create: () => Promise.resolve({}),
            rename: () => Promise.resolve(),
            duplicate: () => Promise.resolve({}),
            delete: () => Promise.resolve(null),
          },
        },
        { provide: SessionPersistenceService, useValue: { applyActiveWorkspace: vi.fn() } },
        { provide: ShellStateService, useValue: { playScene: vi.fn() } },
        { provide: DesktopApiService, useValue: { api: {} } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
        {
          provide: CollabStore,
          useValue: {
            status: signal(localCollabStatus()),
            repos: signal([]),
            statusLine: signal('Only on this PC'),
            openConnect: vi.fn(),
            removeFromPc: vi.fn(),
            publish: vi.fn(),
            repoForWorkspace: () => null,
          },
        },
      ],
    });
  });

  it('lists the workspaces on this PC', () => {
    const fixture = TestBed.createComponent(WorkspaceManagerComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Manage workspaces');
    expect(fixture.nativeElement.textContent).toContain('Default');
  });
});

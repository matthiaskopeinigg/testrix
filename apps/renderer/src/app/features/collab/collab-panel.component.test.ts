import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { localCollabStatus } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { ShellStateService } from '../../core/shell-state.service';
import { ServicesStore } from '../services/services.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabPanelComponent } from './collab-panel.component';
import { CollabStore } from './collab.store';

describe('CollabPanelComponent', () => {
  const hasRepos = signal(false);
  const dockRepo = signal<null | { id: string; repoName: string }>(null);
  const tab = signal('overview');
  const needsPublishPrompt = signal(false);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CollabStore,
          useValue: {
            hasRepos,
            dockRepo,
            tab,
            repos: signal([]),
            status: signal(localCollabStatus()),
            dockIsActiveRepo: signal(false),
            needsPublishPrompt,
            showRepoSwitcher: signal(false),
            liveRuns: signal([]),
            staleLocks: signal([]),
            activePresence: signal([]),
            dockStatusLine: signal('Only on this PC'),
            dockStatusDetail: signal(''),
            remoteChip: signal(''),
            openConnect: vi.fn(),
            chooseWorkspaces: vi.fn(),
            publishActiveWorkspace: vi.fn(),
            setTab: vi.fn(),
          },
        },
        { provide: ShellStateService, useValue: { openSettings: vi.fn() } },
        { provide: ServicesStore, useValue: { findRegression: () => null } },
        { provide: WorkspacesStore, useValue: { active: signal(null) } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
      ],
    });
  });

  it('asks the user to connect when no repositories are linked', () => {
    hasRepos.set(false);
    dockRepo.set(null);
    needsPublishPrompt.set(false);
    const fixture = TestBed.createComponent(CollabPanelComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connect a repository');
  });

  it('prompts to publish when a repository is connected but the workspace is local', () => {
    hasRepos.set(true);
    needsPublishPrompt.set(true);
    const fixture = TestBed.createComponent(CollabPanelComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Connected. Add a workspace when you are ready.');
    expect(fixture.nativeElement.textContent).toContain('Publish this workspace');
    expect(fixture.nativeElement.textContent).toContain('Choose workspaces');
  });
});

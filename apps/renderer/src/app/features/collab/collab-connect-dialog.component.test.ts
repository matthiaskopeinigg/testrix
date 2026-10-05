import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabConnectDialogComponent } from './collab-connect-dialog.component';
import { CollabStore } from './collab.store';

describe('CollabConnectDialogComponent', () => {
  const connectStep = signal<'address' | 'pick'>('address');
  const publishDraftId = signal<string | null>(null);
  const pickedRemoteIds = signal<ReadonlySet<string>>(new Set());
  const publishableWorkspaces = signal<readonly { id: string; name: string }[]>([]);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CollabStore,
          useValue: {
            connectStep,
            connectOpen: signal(true),
            busy: signal(false),
            error: signal(null),
            remoteDraft: signal(''),
            userDraft: signal(''),
            tokenDraft: signal(''),
            branchDraft: signal('main'),
            connectAdvanced: signal(false),
            canConnect: signal(false),
            needsToken: signal(false),
            remotePreview: signal(''),
            connectedRepo: signal(null),
            publishableWorkspaces,
            publishDraftId,
            pickedRemoteIds,
            canFinishConnect: signal(false),
            closeConnect: vi.fn(),
            connect: vi.fn(),
            finishConnect: vi.fn(),
            skipPicking: vi.fn(),
            togglePick: vi.fn(),
            updateCredential: vi.fn(),
          },
        },
        { provide: WorkspacesStore, useValue: { active: signal(null) } },
      ],
    });
  });

  it('labels the first step as connecting to a repository', () => {
    connectStep.set('address');
    const fixture = TestBed.createComponent(CollabConnectDialogComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/repository|address|connect/i);
  });

  it('says Add and publish when both a pick and a publish are set', () => {
    connectStep.set('pick');
    pickedRemoteIds.set(new Set(['ws-a']));
    publishDraftId.set('local-1');
    publishableWorkspaces.set([{ id: 'local-1', name: 'Local' }]);
    const fixture = TestBed.createComponent(CollabConnectDialogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.finishLabel()).toBe('Add and publish');
  });

  it('labels an empty-repo publish as Publish and open', () => {
    connectStep.set('pick');
    pickedRemoteIds.set(new Set());
    publishDraftId.set('local-1');
    publishableWorkspaces.set([{ id: 'local-1', name: 'Local' }]);
    const fixture = TestBed.createComponent(CollabConnectDialogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.finishLabel()).toBe('Publish and open');
  });
});

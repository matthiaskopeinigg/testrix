import '@angular/compiler';
import { DestroyRef, signal, ɵChangeDetectionScheduler } from '@angular/core';
import { localCollabStatus, type CollabRepoSummary, type CollabStatus } from '@testrix/contracts';
import { TxToastService } from '@testrix/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreHarness } from '../../../testing/store-harness';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollectionsStore } from '../collections/collections.store';
import { DatabaseStore } from '../database/database.store';
import { EnvironmentsStore } from '../environments/environments.store';
import { FlowTemplatesStore } from '../services/flows/flow-templates.store';
import { ServicesStore } from '../services/services.store';
import { PlantumlStore } from '../tools/plantuml/plantuml.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabStore } from './collab.store';

function status(patch: Partial<CollabStatus> = {}): CollabStatus {
  return { ...localCollabStatus(), ...patch };
}

describe('CollabStore', () => {
  let onStatus: (next: CollabStatus) => void;
  let setWatching: ReturnType<typeof vi.fn>;
  let connectRepo: ReturnType<typeof vi.fn>;
  let store: CollabStore;
  const collabDockOpen = signal(false);
  const collabDockTab = signal<'overview' | 'workspaces'>('overview');
  const items = signal<readonly { id: string; kind: string; collab?: unknown }[]>([]);
  const active = signal<{ id: string; kind: string; collab?: unknown } | null>(null);
  const activeId = signal<string | null>(null);
  const openCollabDock = vi.fn();

  function repo(id: string, name = id): CollabRepoSummary {
    return {
      id,
      remoteUrl: `https://github.com/acme/${name}.git`,
      label: 'github.com',
      repoName: name,
      provider: 'GitHub',
      transport: 'https',
      branch: 'main',
      sync: 'auto',
      state: 'idle',
      attention: 'none',
      lastSyncAt: null,
      lastError: null,
      hasCredential: true,
      workspaces: [],
    };
  }

  beforeEach(() => {
    setWatching = vi.fn();
    connectRepo = vi.fn();
    openCollabDock.mockClear();
    onStatus = () => undefined;
    store = createStoreHarness(
      CollabStore,
      {
        api: {
          collab: {
            onStatus: (fn: (next: CollabStatus) => void) => {
              onStatus = fn;
              return () => undefined;
            },
            getStatus: () => Promise.resolve(status()),
            setWatching,
            connectRepo,
          },
        },
      } as never,
      [
        { provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined } },
        { provide: DestroyRef, useValue: { onDestroy: () => undefined } },
        { provide: WorkspacesStore, useValue: { items, active, activeId } },
        { provide: CollectionsStore, useValue: { nodeById: () => null } },
        { provide: EnvironmentsStore, useValue: { environmentById: () => null } },
        { provide: DatabaseStore, useValue: { connectionById: () => null, queryById: () => null } },
        { provide: ServicesStore, useValue: { openArtifact: vi.fn() } },
        { provide: FlowTemplatesStore, useValue: { openTemplate: vi.fn() } },
        { provide: PlantumlStore, useValue: { openDiagram: vi.fn() } },
        { provide: SessionPersistenceService, useValue: { applyActiveWorkspace: vi.fn() } },
        {
          provide: ShellStateService,
          useValue: { collabDockOpen, collabDockTab, openCollabDock, openCollabDockTab: vi.fn(), toggleCollabDock: vi.fn() },
        },
        { provide: WorkbenchStore, useValue: { openCollabReview: vi.fn(), closeCollabReview: vi.fn() } },
        { provide: TxToastService, useValue: { show: vi.fn() } },
      ],
    ).store;
  });

  it('starts local and follows pushed status', () => {
    expect(store.status().kind).toBe('local');
    expect(store.statusLine()).toBe('Only on this PC');
    onStatus(status({ kind: 'shared', state: 'offline' }));
    expect(store.statusLine()).toBe('Offline');
    expect(store.railState()).toBe('offline');
  });

  it('opens the connect sheet and resets drafts', () => {
    store.remoteDraft.set('https://github.com/acme/old.git');
    store.openConnect('ws_local');
    expect(store.connectOpen()).toBe(true);
    expect(store.connectStep()).toBe('address');
    expect(store.remoteDraft()).toBe('');
    expect(store.canConnect()).toBe(false);
    store.remoteDraft.set('https://github.com/acme/api.git');
    expect(store.canConnect()).toBe(true);
  });

  it('toggles workspace picks and requires a pick or publish to finish', () => {
    expect(store.canFinishConnect()).toBe(false);
    store.togglePick('ws-a', true);
    expect(store.canFinishConnect()).toBe(true);
    store.togglePick('ws-a', false);
    expect(store.canFinishConnect()).toBe(false);
    store.publishDraftId.set('local-1');
    expect(store.canFinishConnect()).toBe(true);
  });

  it('follows the active workspace repository when the dock opens', () => {
    const alpha = repo('repo-alpha', 'alpha');
    const beta = repo('repo-beta', 'beta');
    onStatus(status({
      kind: 'shared',
      repos: [alpha, beta],
      activeRepoId: 'repo-alpha',
    }));
    store.showRepo('repo-beta');
    expect(store.dockRepo()?.id).toBe('repo-beta');
    expect(store.dockIsActiveRepo()).toBe(false);
    store.openDock();
    expect(store.dockRepo()?.id).toBe('repo-alpha');
    expect(store.dockIsActiveRepo()).toBe(true);
    expect(openCollabDock).toHaveBeenCalled();
  });

  it('prompts to publish when the open workspace is only on this PC', () => {
    onStatus(status({
      kind: 'local',
      repos: [repo('repo-alpha', 'alpha')],
      activeRepoId: null,
    }));
    expect(store.needsPublishPrompt()).toBe(true);
    store.chooseWorkspaces('repo-alpha');
    expect(store.needsPublishPrompt()).toBe(false);
    expect(store.dockRepo()?.id).toBe('repo-alpha');
  });

  it('opens the token sheet for an existing repository', () => {
    onStatus(status({
      kind: 'shared',
      repos: [repo('repo-alpha', 'alpha')],
      activeRepoId: 'repo-alpha',
    }));
    store.openUpdateToken('repo-alpha');
    expect(store.connectOpen()).toBe(true);
    expect(store.connectStep()).toBe('token');
  });
});

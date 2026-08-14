import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createDefaultSettings, createDefaultWorkspaceEditor } from '@shared/config';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';

import { WorkspaceEditorMotionService } from './workspace-editor-motion.service';
import { WorkspaceEditorService } from './workspace-editor.service';

describe('WorkspaceEditorService', () => {
  let service: WorkspaceEditorService;
  let patchSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    patchSession = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        WorkspaceEditorService,
        {
          provide: ConfigService,
          useValue: {
            settings: () => createDefaultSettings(),
            session: () => ({
              workspace: {
                editor: createDefaultWorkspaceEditor(),
              },
            }),
            sessionRevision: () => 0,
            patchSession,
          },
        },
        {
          provide: CollectionsService,
          useValue: {
            nodes: () => [
              {
                id: 'req-1',
                label: 'Get users',
                kind: 'request',
                data: { kind: 'request', method: 'GET', url: '/users' },
              },
            ],
          },
        },
        {
          provide: WorkspaceEditorMotionService,
          useValue: {
            runSplitTransition: (_ids: readonly string[], mutate: () => void) => mutate(),
            runMergeTransition: (mutate: () => void) => mutate(),
          },
        },
      ],
    });

    service = TestBed.inject(WorkspaceEditorService);
  });

  it('opens a request tab in the focused group', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    expect(service.hasAnyTabs()).toBe(true);
    const tabs = service.tabsForGroup('main');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.label).toBe('Get users');
    expect(tabs[0]?.icon).toBe('http');
    expect(tabs[0]?.method).toBe('GET');
  });

  it('focuses existing tab when opening same resource', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    const firstTabId = service.activeTab()?.id;
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    expect(service.activeTab()?.id).toBe(firstTabId);
  });

  it('pins tabs and keeps them first', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    const tabId = service.tabsForGroup('main')[0]!.id;
    service.pinTab('main', tabId, true);
    const tabs = service.tabsForGroup('main');
    expect(tabs[0]?.id).toBe(tabId);
    expect(tabs[0]?.pinned).toBe(true);
  });

  it('clears editor chrome state when the last tab is closed', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    const tabId = service.tabsForGroup('main')[0]!.id;
    service.closeTab('main', tabId);
    expect(service.hasAnyTabs()).toBe(false);
    expect(service.hasMultiplePanes()).toBe(false);
  });

  it('closes tabs matching deleted resource ids across groups', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    service.openResource({ resourceId: 'uuid-generator', kind: 'dev-tool' });
    expect(service.tabsForGroup('main')).toHaveLength(2);
    service.closeTabsForResourceIds(['req-1']);
    expect(service.tabsForGroup('main')).toHaveLength(1);
    expect(service.activeTab()?.resourceId).toBe('uuid-generator');
  });

  it('resolves dev-tool tab labels from the development registry', () => {
    service.openResource({ resourceId: 'uuid-generator', kind: 'dev-tool' });
    const tabs = service.tabsForGroup('main');
    expect(tabs[0]?.label).toBe('UUID Generator');
    expect(tabs[0]?.icon).toBe('development');
  });

  it('splits pane and moves tab when dropped on an edge zone', () => {
    service.openResource({ resourceId: 'req-1', kind: 'request' });
    const tabId = service.tabsForGroup('main')[0]!.id;

    service.moveTabToSplitPane(tabId, 'main', 'main', 'right');

    expect(service.hasMultiplePanes()).toBe(true);
    expect(service.tabsForGroup('main')).toHaveLength(0);
    const focused = service.focusedGroupId();
    expect(service.tabsForGroup(focused)).toHaveLength(1);
    expect(service.tabsForGroup(focused)[0]?.label).toBe('Get users');
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionsService } from '@app/core/collections/collections.service';
import { TeamsPanelService } from '@app/core/collaboration/teams-panel.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { HistoryService } from '@app/core/history/history.service';
import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { CommandPaletteService } from '@app/core/ui/command-palette.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { SettingsPopupService } from '@app/core/ui/settings-popup.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarSessionService } from '@app/core/workspace/workspace-sidebar-session.service';
import type { CollectionTreeNode } from '@app/features/shell/collections/collection-tree.types';

import { CommandRegistryService } from './command-registry.service';
import { CommandSeedsService } from './command-seeds.service';

function configureSeedsTestBed(options: {
  readonly collectionNodes?: ReturnType<typeof signal<CollectionTreeNode[]>>;
  readonly openResource?: ReturnType<typeof vi.fn>;
} = {}): void {
  const collectionNodes = options.collectionNodes ?? signal<CollectionTreeNode[]>([]);
  const openResource = options.openResource ?? vi.fn();

  TestBed.configureTestingModule({
    providers: [
      CommandRegistryService,
      CommandSeedsService,
      { provide: WorkspaceEditorService, useValue: { openResource } },
      {
        provide: CollectionsService,
        useValue: { nodes: collectionNodes, createFolder: vi.fn() },
      },
      { provide: EnvironmentsService, useValue: { environments: signal([]) } },
      { provide: HistoryService, useValue: { nodes: signal([]) } },
      { provide: TestSuiteService, useValue: { nodes: signal([]) } },
      { provide: LoadTestService, useValue: { nodes: signal([]), tabResourceId: (id: string) => id } },
      { provide: RegressionService, useValue: { nodes: signal([]), tabResourceId: (id: string) => id } },
      { provide: MockServerService, useValue: { nodes: signal([]) } },
      { provide: CaptureWorkbenchStore, useValue: { nodes: signal([]), tabResourceId: (id: string) => id } },
      { provide: InterceptorWorkspaceStore, useValue: { nodes: signal([]), tabResourceId: (id: string) => id } },
      {
        provide: WorkspaceSidebarSessionService,
        useValue: { setActiveSidebarPanelId: vi.fn(), setSidebarPanelOpen: vi.fn() },
      },
      { provide: SettingsPopupService, useValue: { show: vi.fn() } },
      { provide: HelpPopupService, useValue: { show: vi.fn() } },
      { provide: TeamsPanelService, useValue: { show: vi.fn() } },
      { provide: CommandPaletteService, useValue: { toggle: vi.fn() } },
    ],
  });
}

describe('CommandSeedsService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('registers static shell commands once', () => {
    configureSeedsTestBed();

    const seeds = TestBed.inject(CommandSeedsService);
    const registry = TestBed.inject(CommandRegistryService);
    seeds.register();
    seeds.register();

    const ids = registry.snapshot().map((cmd) => cmd.id);
    expect(ids).toContain('shell.openSettings');
    expect(ids).toContain('shell.toggleCommandPalette');
    expect(ids).toContain('sidebar.collections');
  });

  it('indexes collection requests for quick open', () => {
    const collectionNodes = signal<CollectionTreeNode[]>([
      {
        id: 'req-1',
        label: 'Get users',
        data: { kind: 'request', method: 'GET', url: 'https://api.example/users' },
      },
    ]);
    const openResource = vi.fn();

    configureSeedsTestBed({ collectionNodes, openResource });

    const seeds = TestBed.inject(CommandSeedsService);
    seeds.register();
    TestBed.flushEffects();

    const registry = TestBed.inject(CommandRegistryService);
    const command = registry.snapshot().find((cmd) => cmd.id === 'collection.open.req-1');
    expect(command?.hint).toBe('GET https://api.example/users');
    command?.run();
    expect(openResource).toHaveBeenCalledWith({ resourceId: 'req-1', kind: 'request' });
  });
});

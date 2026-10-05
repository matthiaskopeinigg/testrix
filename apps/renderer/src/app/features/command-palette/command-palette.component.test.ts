import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_SHORTCUTS } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopApiService } from '../../core/desktop-api.service';
import { PalettePinsStore } from '../../core/palette-pins.store';
import { ShellStateService } from '../../core/shell-state.service';
import { CookieAuthDialogService } from '../cookie-auth/cookie-auth-dialog.service';
import { DatabaseQueryActionsService } from '../database/database-query-actions.service';
import { CollectionHealthService } from '../collections/collection-health.service';
import { CollectionsStore } from '../collections/collections.store';
import { CollabStore } from '../collab/collab.store';
import { HistoryStore } from '../history/history.store';
import { HelpContextService } from '../help/help-context.service';
import { ServicesStore } from '../services/services.store';
import { ToolsStore } from '../tools/tools.store';
import { UpdateStore } from '../updates/update.store';
import { ExportWorkspaceDialogService } from '../workspace-transfer/export-workspace-dialog.service';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CommandPaletteComponent } from './command-palette.component';

describe('CommandPaletteComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ShellStateService,
          useValue: {
            closeOverlays: vi.fn(),
            openSettings: vi.fn(),
            openWorkspaceManager: vi.fn(),
            openRail: vi.fn(),
            setActiveRail: vi.fn(),
            playScene: vi.fn(),
          },
        },
        {
          provide: DesktopApiService,
          useValue: {
            settings: () => ({ shortcuts: DEFAULT_SHORTCUTS }),
            setUiZoom: vi.fn(),
            api: {
              app: { reload: vi.fn() },
              window: { openWorkbench: vi.fn() },
              workspace: { pickImportSource: vi.fn(), importInspect: vi.fn() },
            },
          },
        },
        {
          provide: WorkbenchStore,
          useValue: {
            openFromTool: vi.fn(),
            openFromNode: vi.fn(),
            openFromHistory: vi.fn(),
            activate: vi.fn(),
            closeInactiveTabs: vi.fn(),
            closeAllButCurrent: vi.fn(),
            groups: signal([]),
            focusedGroup: signal(null),
            tabs: signal([]),
            activeTab: signal(null),
            lastClosedTab: signal(null),
            restoreLastClosedTab: vi.fn(),
            requestViewsByNodeId: signal({}),
          },
        },
        { provide: DatabaseQueryActionsService, useValue: { create: vi.fn(), run: vi.fn() } },
        { provide: CookieAuthDialogService, useValue: { open: vi.fn() } },
        { provide: ToolsStore, useValue: { items: signal([]), drillIn: vi.fn() } },
        { provide: ServicesStore, useValue: { items: signal([]), findFlow: () => null, drillIn: vi.fn(), openArtifact: vi.fn() } },
        { provide: ExportWorkspaceDialogService, useValue: { open: vi.fn() } },
        { provide: ImportWorkspaceDialogService, useValue: { open: vi.fn(), show: vi.fn() } },
        { provide: CollectionsStore, useValue: { tree: signal([]), search: signal('') } },
        { provide: CollectionHealthService, useValue: { open: vi.fn() } },
        { provide: HistoryStore, useValue: { items: signal([]), entries: signal([]) } },
        { provide: HelpContextService, useValue: { open: vi.fn(), openContextualHelp: vi.fn() } },
        {
          provide: CollabStore,
          useValue: {
            openConnect: vi.fn(),
            openDock: vi.fn(),
            syncNow: vi.fn(),
            chooseWorkspaces: vi.fn(),
            status: signal({ kind: 'local' }),
            hasRepos: signal(false),
          },
        },
        { provide: WorkspacesStore, useValue: { active: signal(null), items: signal([]) } },
        {
          provide: UpdateStore,
          useValue: {
            status: signal({ state: 'idle' }),
            isReady: signal(false),
            readyVersion: signal(null),
            availableVersion: signal(null),
            downloadAndInstall: vi.fn(),
            install: vi.fn(),
            restart: vi.fn(),
            check: vi.fn(),
          },
        },
        { provide: PalettePinsStore, useValue: { pins: signal([]), toggle: vi.fn(), unpin: vi.fn() } },
      ],
    });
  });

  it('renders the command search field', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toMatch(/command|search/i);
  });
});

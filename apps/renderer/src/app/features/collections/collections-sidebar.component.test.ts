import { OverlayModule } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { PalettePinsStore } from '../../core/palette-pins.store';
import { ImportWorkspaceDialogService } from '../workspace-transfer/import-workspace-dialog.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { CollectionHealthService } from './collection-health.service';
import { CollectionsDndService } from './collections-dnd.service';
import { CollectionsSidebarComponent } from './collections-sidebar.component';
import { CollectionsStore } from './collections.store';

function emptyDnd() {
  return {
    registerSurface: vi.fn(),
    isIndicatorVisible: signal(false),
    isIndicatorDenied: signal(false),
    indicatorLeft: signal(0),
    indicatorY: signal(0),
    announcement: signal(''),
  };
}

describe('CollectionsSidebarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule],
      providers: [
        {
          provide: CollectionsStore,
          useValue: {
            hasVisibleNodes: signal(false),
            isTreeEmpty: signal(true),
            visibleTree: signal([]),
            searchQuery: signal(''),
            selectedIds: signal([]),
            filters: signal({ kinds: [], methods: [], statuses: [] }),
            isFilterActive: signal(false),
            allFoldersExpanded: signal(false),
            sortMode: signal('name-asc'),
            dragNode: signal(null),
            setSearchQuery: vi.fn(),
          },
        },
        { provide: CollectionsDndService, useValue: emptyDnd() },
        { provide: WorkbenchStore, useValue: { openNodeIds: signal([]), activeNodeId: signal(null) } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
        { provide: DesktopApiService, useValue: { settings: () => ({}) } },
        { provide: ImportWorkspaceDialogService, useValue: { open: vi.fn() } },
        { provide: PalettePinsStore, useValue: { pins: signal([]) } },
        { provide: CollectionHealthService, useValue: { open: vi.fn() } },
      ],
    });
  });

  it('shows the empty-state New request action and search field', () => {
    const fixture = TestBed.createComponent(CollectionsSidebarComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Start a collection');
    expect(text).toContain('New request');
    expect(fixture.nativeElement.querySelector('#collections-search')).not.toBeNull();
  });
});

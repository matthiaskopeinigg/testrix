import { OverlayModule } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { DatabaseDndService } from './database-dnd.service';
import { DatabaseSidebarComponent } from './database-sidebar.component';
import { DatabaseStore } from './database.store';

describe('DatabaseSidebarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule],
      providers: [
        {
          provide: DatabaseStore,
          useValue: {
            connectionsOpen: signal(true),
            queriesOpen: signal(true),
            connectionCount: signal(0),
            queryCount: signal(0),
            visibleConnectionTree: signal([]),
            visibleQueryTree: signal([]),
            pickerConnectionId: signal(null),
            searchQuery: signal(''),
            allFoldersExpanded: signal(false),
            isFilterActive: signal(false),
            filters: signal({}),
            sortMode: signal('saved'),
            dragNode: signal(null),
            toggleSection: vi.fn(),
            setSearchQuery: vi.fn(),
          },
        },
        {
          provide: DatabaseDndService,
          useValue: {
            registerSurface: vi.fn(),
            isIndicatorVisible: signal(false),
            isIndicatorDenied: signal(false),
            indicatorLeft: signal(0),
            indicatorY: signal(0),
            announcement: signal(''),
          },
        },
        { provide: WorkbenchStore, useValue: { openNodeIds: signal([]), activeNodeId: signal(null) } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
      ],
    });
  });

  it('shows Connections chrome and the empty New connection action', () => {
    const fixture = TestBed.createComponent(DatabaseSidebarComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Connections');
    expect(text).toContain('No connections');
    expect(text).toContain('New connection');
    expect(fixture.nativeElement.querySelector('#database-search')).not.toBeNull();
  });
});

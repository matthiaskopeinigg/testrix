import { OverlayModule } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { CollectionsStore } from '../collections/collections.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { EnvironmentsDndService } from './environments-dnd.service';
import { EnvironmentsSidebarComponent } from './environments-sidebar.component';
import { EnvironmentsStore } from './environments.store';

describe('EnvironmentsSidebarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule],
      providers: [
        {
          provide: EnvironmentsStore,
          useValue: {
            hasVisibleEnvironments: signal(false),
            items: signal([]),
            searchQuery: signal(''),
            selectedIds: signal([]),
            setSearchQuery: vi.fn(),
          },
        },
        {
          provide: EnvironmentsDndService,
          useValue: {
            registerSurface: vi.fn(),
            isIndicatorVisible: signal(false),
            indicatorLeft: signal(0),
            indicatorY: signal(0),
            announcement: signal(''),
          },
        },
        { provide: WorkbenchStore, useValue: { tabs: signal([]), groups: signal([]) } },
        { provide: CollectionsStore, useValue: { tree: signal([]) } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
      ],
    });
  });

  it('shows the empty-state New environment action', () => {
    const fixture = TestBed.createComponent(EnvironmentsSidebarComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No environments');
    expect(text).toContain('New environment');
    expect(fixture.nativeElement.querySelector('#environments-search')).not.toBeNull();
  });
});

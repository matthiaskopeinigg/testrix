import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { CookieJarStore } from '../workbench/request/cookie-jar.store';
import { HistorySidebarComponent } from './history-sidebar.component';
import { HistoryStore } from './history.store';

describe('HistorySidebarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HistoryStore,
          useValue: {
            searchQuery: signal(''),
            isFilterActive: signal(false),
            groupBy: signal('day'),
            entries: signal([]),
            filtered: signal([]),
            groups: signal([]),
            isSelected: () => false,
            setSearchQuery: vi.fn(),
          },
        },
        { provide: WorkbenchStore, useValue: { focusedGroup: signal(null) } },
        { provide: ConfirmDialogService, useValue: { ask: vi.fn() } },
        { provide: DesktopApiService, useValue: { settings: () => ({}) } },
        { provide: CookieJarStore, useValue: {} },
      ],
    });
  });

  it('shows the empty history sidebar and search field', () => {
    const fixture = TestBed.createComponent(HistorySidebarComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No history yet');
    expect(fixture.nativeElement.querySelector('#history-search')).not.toBeNull();
  });
});

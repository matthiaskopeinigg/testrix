import { OverlayModule } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_USER_SETTINGS } from '@testrix/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DesktopApiService } from '../../core/desktop-api.service';
import { DirtyTabsRegistry } from '../../core/dirty-tabs.registry';
import { DatabaseTabCloseService } from '../database/database-tab-close.service';
import { DatabaseStore } from '../database/database.store';
import type { WorkbenchTab } from './workbench.store';
import { WorkbenchStore } from './workbench.store';
import { WorkbenchTablistComponent } from './workbench-tablist.component';

const GET_USERS: WorkbenchTab = {
  id: 'tab_1',
  nodeId: 'req_1',
  kind: 'http',
  title: 'Get users',
  method: 'GET',
  url: 'https://api.example.com/users',
  status: null,
};

describe('WorkbenchTablistComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OverlayModule],
      providers: [
        {
          provide: WorkbenchStore,
          useValue: {
            focusedGroup: signal(null),
            isTabSelected: () => false,
            dragTabIds: signal([]),
            applyTabPointerSelect: vi.fn(),
            beginTabDrag: vi.fn(),
            endTabDrag: vi.fn(),
            clearTabSelection: vi.fn(),
          },
        },
        { provide: DatabaseTabCloseService, useValue: { confirmClose: vi.fn() } },
        { provide: DirtyTabsRegistry, useValue: { isDirty: () => false } },
        { provide: DesktopApiService, useValue: { settings: () => DEFAULT_USER_SETTINGS } },
        { provide: DatabaseStore, useValue: { connectionById: () => null, queryById: () => null } },
      ],
    });
  });

  it('renders an open stub tab', () => {
    const fixture = TestBed.createComponent(WorkbenchTablistComponent);
    fixture.componentRef.setInput('groupId', 'g1');
    fixture.componentRef.setInput('listId', 'list-1');
    fixture.componentRef.setInput('tabs', [GET_USERS]);
    fixture.componentRef.setInput('activeTabId', GET_USERS.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Get users');
    expect(fixture.nativeElement.querySelector('[data-tab-id="tab_1"]')).not.toBeNull();
  });
});

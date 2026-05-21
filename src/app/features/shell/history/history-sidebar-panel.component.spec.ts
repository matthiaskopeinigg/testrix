import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { HistoryService } from '@app/core/history/history.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxIconService } from '@app/shared/icons/tx-icon.service';

import { toTreeNodes } from './history-tree.adapter';
import { HISTORY_ITEMS_FIXTURE } from './history-tree.fixture';
import { HistorySidebarPanelComponent } from './history-sidebar-panel.component';

describe('HistorySidebarPanelComponent', () => {
  let fixture: ComponentFixture<HistorySidebarPanelComponent>;
  const treeNodes = toTreeNodes(HISTORY_ITEMS_FIXTURE);
  const openResource = vi.fn();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorySidebarPanelComponent],
      providers: [
        {
          provide: HistoryService,
          useValue: {
            nodes: signal(treeNodes),
            items: signal(HISTORY_ITEMS_FIXTURE),
            getItem: (id: string) => HISTORY_ITEMS_FIXTURE.find((item) => item.id === id),
            hydrate: vi.fn().mockResolvedValue(undefined),
            deleteNode: vi.fn().mockReturnValue(true),
            clearAll: vi.fn(),
          },
        },
        {
          provide: WorkspaceEditorService,
          useValue: {
            groups: signal({ main: { tabs: [], activeTabId: null } }),
            openResource,
          },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorySidebarPanelComponent);
    fixture.detectChanges();
  });

  it('renders grouped history request rows', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const urls = [...fixture.nativeElement.querySelectorAll('.history-sidebar-panel__url')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(urls).toContain('/users');
    expect(urls).toContain('/login');
  });

  it('filters history when search changes', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSearch']('login');
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    await fixture.whenStable();
    vi.useRealTimers();

    const urls = [...fixture.nativeElement.querySelectorAll('.history-sidebar-panel__url')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(urls).toContain('/login');
    expect(urls).not.toContain('/users');
  });

  it('opens a history workspace tab when an entry is selected', () => {
    fixture.componentInstance['handleSelectEntry']('hist-login');
    expect(openResource).toHaveBeenCalledWith({ resourceId: 'hist-login', kind: 'history' });
  });
});

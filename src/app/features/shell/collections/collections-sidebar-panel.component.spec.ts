import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { createDefaultSession, createDefaultSettings } from '@shared/config';
import { TxIconService } from '@app/shared/icons/tx-icon.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';

import { collectFolderIds } from './collection-tree.expand';
import { findCollectionNode } from './collection-tree.mutations';
import { COLLECTION_TREE_MOCK } from './collection-tree.mock';
import { CollectionsSidebarPanelComponent } from './collections-sidebar-panel.component';

describe('CollectionsSidebarPanelComponent', () => {
  let fixture: ComponentFixture<CollectionsSidebarPanelComponent>;
  let openResource: ReturnType<typeof vi.fn>;
  let closeTabsForResourceIds: ReturnType<typeof vi.fn>;
  let patchSession: ReturnType<typeof vi.fn>;
  const treeNodes = COLLECTION_TREE_MOCK;
  const folderIds = collectFolderIds(treeNodes);

  const settingsState = signal(createDefaultSettings());

  beforeEach(async () => {
    settingsState.set(createDefaultSettings());
    openResource = vi.fn();
    closeTabsForResourceIds = vi.fn();
    patchSession = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [CollectionsSidebarPanelComponent],
      providers: [
        {
          provide: CollectionsService,
          useValue: {
            nodes: signal(treeNodes),
            hydrate: vi.fn().mockResolvedValue(undefined),
            saveNodes: vi.fn(),
            createFolder: vi.fn().mockReturnValue('new-folder'),
            createRequest: vi.fn(),
            createWebsocket: vi.fn(),
            renameNode: vi.fn().mockReturnValue(true),
            deleteNode: vi.fn().mockReturnValue(true),
            duplicateNode: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            settings: settingsState,
            session: signal({
              ...createDefaultSession(),
              workspace: {
                ...createDefaultSession().workspace,
                collections: { expandedFolderIds: folderIds },
              },
            }),
            sessionRevision: signal(0),
            patchSession,
          },
        },
        {
          provide: TxIconService,
          useValue: {
            loadIconInner: () => Promise.resolve('<path d="M6 6l12 12"/>'),
          },
        },
        {
          provide: TxNotificationService,
          useValue: { showInfo: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() },
        },
        {
          provide: WorkspaceEditorService,
          useValue: {
            openResource,
            activeTab: signal(null),
            focusedGroupId: signal('main'),
            closeTabsForResourceIds,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsSidebarPanelComponent);
    fixture.detectChanges();
  });

  it('persists expanded folder ids to session when folders toggle', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleExpandedChange'](folderIds);
    fixture.detectChanges();
    vi.advanceTimersByTime(350);
    await vi.runOnlyPendingTimersAsync();
    expect(patchSession).toHaveBeenCalledWith({
      workspace: { collections: { expandedFolderIds: folderIds } },
    });
    vi.useRealTimers();
  });

  it('renders folder, request, and websocket rows when expanded', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.tx-tree-row__label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toContain('Auth');
    expect(labels.some((l) => l.includes('/login'))).toBe(true);
    expect(labels.some((l) => l.startsWith('WS '))).toBe(true);
  });

  it('filters tree when search changes', async () => {
    vi.useFakeTimers();
    fixture.componentInstance['handleSearch']('login');
    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    await fixture.whenStable();
    vi.useRealTimers();

    const labels = [...fixture.nativeElement.querySelectorAll('.tx-tree-row__label')].map(
      (el: Element) => el.textContent?.trim() ?? '',
    );

    expect(labels).toContain('Auth');
    expect(labels.some((l) => l.includes('/login'))).toBe(true);
    expect(labels.some((l) => l.includes('/users'))).toBe(false);
  });

  it('collapses folders when expand-all is turned off', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    let rows = fixture.nativeElement.querySelectorAll('tx-tree-row');
    expect(rows.length).toBeGreaterThan(3);

    fixture.componentInstance['handleExpandAll'](false);
    fixture.detectChanges();

    rows = fixture.nativeElement.querySelectorAll('tx-tree-row');
    expect(rows.length).toBe(4);
  });

  it('opens a workspace tab when a request row is clicked', () => {
    const requestRow = [...fixture.nativeElement.querySelectorAll('.tx-tree-row')].find((row: Element) =>
      row.textContent?.includes('/login'),
    ) as HTMLElement | undefined;
    expect(requestRow).toBeTruthy();
    requestRow?.click();
    fixture.detectChanges();
    expect(openResource).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'request', resourceId: expect.any(String) }),
    );
  });

  it('opens a workspace tab when a folder row is clicked with expandCollapseAndOpenTab', () => {
    const folderRow = [...fixture.nativeElement.querySelectorAll('.tx-tree-row')].find((row: Element) =>
      row.textContent?.includes('Auth'),
    ) as HTMLElement | undefined;
    expect(folderRow).toBeTruthy();
    folderRow?.click();
    fixture.detectChanges();
    expect(openResource).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', resourceId: expect.any(String) }),
    );
  });

  it('opens tab without toggling expansion when behavior is openTab', async () => {
    vi.useFakeTimers();
    settingsState.set({
      ...createDefaultSettings(),
      collections: {
        ...createDefaultSettings().collections,
        folderClickBehavior: 'openTab',
      },
    });
    fixture.detectChanges();

    openResource.mockClear();
    patchSession.mockClear();

    const folderRow = [...fixture.nativeElement.querySelectorAll('.tx-tree-row')].find((row: Element) =>
      row.textContent?.includes('Auth'),
    ) as HTMLElement | undefined;
    expect(folderRow).toBeTruthy();
    const authFolderId = folderIds.find((id) => {
      const loc = findCollectionNode(treeNodes, id);
      return loc?.node.label === 'Auth';
    });
    expect(authFolderId).toBeTruthy();

    const expandedBefore = fixture.componentInstance['expandedIds']();
    expect(expandedBefore).toContain(authFolderId);

    folderRow?.click();
    fixture.detectChanges();

    expect(openResource).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', resourceId: authFolderId }),
    );
    expect(fixture.componentInstance['expandedIds']()).toEqual(expandedBefore);

    vi.useRealTimers();
  });

  it('toggles expansion without opening a tab when behavior is expandCollapse', async () => {
    vi.useFakeTimers();
    settingsState.set({
      ...createDefaultSettings(),
      collections: {
        ...createDefaultSettings().collections,
        folderClickBehavior: 'expandCollapse',
      },
    });
    fixture.detectChanges();

    openResource.mockClear();
    patchSession.mockClear();

    const folderRow = [...fixture.nativeElement.querySelectorAll('.tx-tree-row')].find((row: Element) =>
      row.textContent?.includes('Auth'),
    ) as HTMLElement | undefined;
    expect(folderRow).toBeTruthy();
    const authFolderId = folderIds.find((id) => {
      const loc = findCollectionNode(treeNodes, id);
      return loc?.node.label === 'Auth';
    });
    expect(authFolderId).toBeTruthy();
    expect(fixture.componentInstance['expandedIds']()).toContain(authFolderId);

    folderRow?.click();
    fixture.detectChanges();
    vi.advanceTimersByTime(350);
    await vi.runOnlyPendingTimersAsync();

    expect(openResource).not.toHaveBeenCalled();
    expect(fixture.componentInstance['expandedIds']()).not.toContain(authFolderId);
    expect(patchSession).toHaveBeenCalledWith({
      workspace: { collections: { expandedFolderIds: expect.not.arrayContaining([authFolderId]) } },
    });

    vi.useRealTimers();
  });

  it('opens tab without toggling expansion when an empty folder is clicked', () => {
    openResource.mockClear();
    patchSession.mockClear();

    const emptyFolderRow = [...fixture.nativeElement.querySelectorAll('.tx-tree-row')].find(
      (row: Element) => row.textContent?.includes('Empty'),
    ) as HTMLElement | undefined;
    expect(emptyFolderRow).toBeTruthy();

    const expandedBefore = fixture.componentInstance['expandedIds']();
    emptyFolderRow?.click();
    fixture.detectChanges();

    expect(openResource).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', resourceId: 'folder-empty' }),
    );
    expect(fixture.componentInstance['expandedIds']()).toEqual(expandedBefore);
    expect(patchSession).not.toHaveBeenCalled();
  });

  it('opens context menu on empty area right-click', () => {
    const body = fixture.nativeElement.querySelector('.collections-sidebar-panel__body');
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    fixture.detectChanges();
    expect(fixture.componentInstance['contextMenuOpen']()).toBe(true);
  });

  it('closes workspace tabs when a collection item is deleted', () => {
    fixture.componentInstance['deleteNodeId'].set('req-login');
    fixture.componentInstance['handleDeleteConfirmed']();
    expect(closeTabsForResourceIds).toHaveBeenCalledWith(
      expect.arrayContaining(['req-login']),
    );
  });
});

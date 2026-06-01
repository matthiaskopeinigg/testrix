import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import {
  DEFAULT_HISTORY_SIDEBAR_SORT_BY,
  DEFAULT_HISTORY_SIDEBAR_STATUS_FILTER,
  type HistorySidebarSortBy,
  type HistorySidebarStatusFilter,
} from '@shared/config';
import {
  filterHistoryByStatus,
  filterHistoryItems,
  formatHistoryElapsedMs,
  groupHistoryItems,
  historyStatusTone,
  sortHistoryItems,
} from '@shared/history';

import { ConfigService } from '@app/core/config/config.service';
import { HistoryService } from '@app/core/history/history.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTooltipDirective } from '@app/shared/components/tx-tooltip/tx-tooltip.directive';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';

import {
  buildEmptyHistoryContextMenu,
  buildHistoryNodeContextMenu,
} from './history-context-menu';
import { historyItemDurationMs, historyItemStatusCode } from './history-entry-display';
import {
  buildHistoryFilterMenuItems,
  buildHistorySortMenuItems,
  isHistorySortAction,
  isHistoryStatusFilterAction,
} from './history-sidebar-menus';
import { findHistoryNode } from './history-tree.mutations';

const SEARCH_DEBOUNCE_MS = 100;
const SESSION_PREF_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-history-sidebar-panel',
  standalone: true,
  imports: [
    DatePipe,
    WorkspaceSidebarPanelShellComponent,
    TxIconComponent,
    TxTooltipDirective,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './history-sidebar-panel.component.html',
  styleUrl: './history-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySidebarPanelComponent {
  private readonly historyService = inject(HistoryService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly configService = inject(ConfigService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search history');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly statusFilter = signal<HistorySidebarStatusFilter>(
    DEFAULT_HISTORY_SIDEBAR_STATUS_FILTER,
  );
  protected readonly sortBy = signal<HistorySidebarSortBy>(DEFAULT_HISTORY_SIDEBAR_SORT_BY);
  protected readonly collapsedByDate = signal<Record<string, boolean>>({});

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly confirmOpen = signal(false);
  protected readonly confirmMessage = signal('');
  private confirmAction: 'delete' | 'clear-all' = 'delete';

  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly displayItems = computed(() => {
    const searched = filterHistoryItems(this.historyService.items(), this.searchQueryDebounced());
    const filtered = filterHistoryByStatus(searched, this.statusFilter());
    return sortHistoryItems(filtered, this.sortBy());
  });

  protected readonly groupedHistory = computed(() =>
    groupHistoryItems(this.displayItems(), this.collapsedByDate()),
  );

  protected readonly hasEntries = computed(() => this.historyService.items().length > 0);

  protected readonly filterToolbarActive = computed(
    () => this.statusFilter() !== DEFAULT_HISTORY_SIDEBAR_STATUS_FILTER,
  );

  protected readonly sortToolbarActive = computed(
    () => this.sortBy() !== DEFAULT_HISTORY_SIDEBAR_SORT_BY,
  );

  protected readonly filterMenuItems = computed(() =>
    buildHistoryFilterMenuItems(this.statusFilter()),
  );

  protected readonly sortMenuItems = computed(() => buildHistorySortMenuItems(this.sortBy()));

  protected readonly allExpanded = computed(() => {
    const groups = this.groupedHistory();
    return groups.length > 0 && groups.every((g) => !g.collapsed);
  });

  protected readonly activeHistoryId = computed(() => {
    for (const group of Object.values(this.workspaceEditor.groups())) {
      if (!group) {
        continue;
      }
      const active = group.tabs.find((tab) => tab.id === group.activeTabId);
      if (active?.kind === 'history') {
        return active.resourceId;
      }
    }
    return undefined;
  });

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      const prefs = this.configService.session()?.workspace.history;
      if (!prefs) {
        return;
      }
      this.statusFilter.set(prefs.statusFilter);
      this.sortBy.set(prefs.sortBy);
      this.collapsedByDate.set({ ...prefs.collapsedByDate });
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQueryDebounced.set(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleExpandAll(expanded: boolean): void {
    const keys = new Set(this.displayItems().map((item) => item.requestedAt.slice(0, 10)));
    const next: Record<string, boolean> = {};
    for (const key of keys) {
      next[key] = !expanded;
    }
    this.collapsedByDate.set(next);
    this.scheduleSessionSave();
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.filterMenuPosition.set({ x: rect.left, y: rect.bottom + 4 });
    this.sortMenuOpen.set(false);
    this.filterMenuOpen.update((open) => !open);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.sortMenuPosition.set({ x: rect.left, y: rect.bottom + 4 });
    this.filterMenuOpen.set(false);
    this.sortMenuOpen.update((open) => !open);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    this.filterMenuOpen.set(false);
    if (!isHistoryStatusFilterAction(actionId)) {
      return;
    }
    this.statusFilter.set(actionId);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    if (!isHistorySortAction(actionId)) {
      return;
    }
    this.sortBy.set(actionId);
    this.scheduleSessionSave();
    this.cdr.markForCheck();
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleClearHistory(): void {
    this.openClearAllConfirm();
  }

  protected handleToggleGroup(dateKey: string): void {
    this.collapsedByDate.update((state) => ({
      ...state,
      [dateKey]: !(state[dateKey] ?? false),
    }));
    this.scheduleSessionSave();
  }

  protected handleSelectEntry(entryId: string): void {
    this.workspaceEditor.openResource({ resourceId: entryId, kind: 'history' });
  }

  protected handleEntryContextMenu(event: MouseEvent, entryId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.openContextMenu(event.clientX, event.clientY, entryId);
  }

  protected handleListAreaContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.history-sidebar-panel__entry')) {
      return;
    }
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY, null);
  }

  protected handleContextMenuSelect(actionId: string): void {
    const nodeId = this.contextNodeId();
    this.contextMenuOpen.set(false);

    switch (actionId) {
      case 'rerun':
        if (nodeId) {
          this.rerunNode(nodeId);
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteConfirm(nodeId);
        }
        break;
      case 'clear-all':
        this.openClearAllConfirm();
        break;
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleConfirmConfirmed(): void {
    if (this.confirmAction === 'clear-all') {
      this.historyService.clearAll();
    } else {
      const id = this.contextNodeId();
      if (id) {
        if (this.historyService.deleteNode(id)) {
          this.workspaceEditor.closeTabsForResourceIds([id]);
        }
      }
    }
    this.confirmOpen.set(false);
  }

  protected handleConfirmClosed(): void {
    this.confirmOpen.set(false);
  }

  protected entryStatusTone(entryId: string): ReturnType<typeof historyStatusTone> {
    const item = this.historyService.getItem(entryId);
    return historyStatusTone(item ? historyItemStatusCode(item) : undefined);
  }

  protected entryStatusCode(entryId: string): number | undefined {
    const item = this.historyService.getItem(entryId);
    return item ? historyItemStatusCode(item) : undefined;
  }

  protected entryElapsed(entryId: string): string {
    const item = this.historyService.getItem(entryId);
    const ms = item ? historyItemDurationMs(item) : undefined;
    if (ms === undefined) {
      return '';
    }
    return formatHistoryElapsedMs(ms);
  }

  protected entryMethod(entryId: string): string {
    return this.historyService.getItem(entryId)?.method ?? 'GET';
  }

  protected entryUrl(entryId: string): string {
    return this.historyService.getItem(entryId)?.url ?? '';
  }

  protected entryRequestedAt(entryId: string): string {
    return this.historyService.getItem(entryId)?.requestedAt ?? '';
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    if (nodeId === null && !this.hasEntries()) {
      return;
    }
    this.contextMenuItems.set(
      nodeId === null ? buildEmptyHistoryContextMenu() : buildHistoryNodeContextMenu(),
    );
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private rerunNode(nodeId: string): void {
    const loc = findHistoryNode(this.historyService.nodes(), nodeId);
    if (!loc?.node.data?.requestId) {
      return;
    }
    this.workspaceEditor.openResource({
      resourceId: loc.node.data.requestId,
      kind: 'request',
    });
  }

  private openDeleteConfirm(nodeId: string): void {
    const loc = findHistoryNode(this.historyService.nodes(), nodeId);
    if (!loc) {
      return;
    }
    this.contextNodeId.set(nodeId);
    this.confirmAction = 'delete';
    this.confirmMessage.set(`Remove "${loc.node.label}" from history?`);
    this.confirmOpen.set(true);
  }

  private openClearAllConfirm(): void {
    this.confirmAction = 'clear-all';
    this.confirmMessage.set('Clear all request history? This cannot be undone.');
    this.confirmOpen.set(true);
  }

  private scheduleSessionSave(): void {
    if (this.sessionSaveTimer !== null) {
      clearTimeout(this.sessionSaveTimer);
    }
    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      const historyPrefs = this.configService.session()?.workspace.history;
      if (!historyPrefs) {
        return;
      }
      void this.configService.patchSession({
        workspace: {
          history: {
            ...historyPrefs,
            statusFilter: this.statusFilter(),
            sortBy: this.sortBy(),
            collapsedByDate: { ...this.collapsedByDate() },
          },
        },
      });
    }, SESSION_PREF_DEBOUNCE_MS);
  }
}

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { filterHistoryItems, formatHistoryElapsedMs, groupHistoryItems, historyStatusTone } from '@shared/history';

import { HistoryService } from '@app/core/history/history.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';

import {
  buildEmptyHistoryContextMenu,
  buildHistoryNodeContextMenu,
} from './history-context-menu';
import { historyItemDurationMs, historyItemStatusCode } from './history-entry-display';
import { findHistoryNode } from './history-tree.mutations';

const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-history-sidebar-panel',
  standalone: true,
  imports: [
    DatePipe,
    WorkspaceSidebarPanelShellComponent,
    TxButtonComponent,
    TxIconComponent,
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

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search history');

  protected readonly searchQueryDebounced = signal('');
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly collapsedByDate = signal<Record<string, boolean>>({});

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly confirmOpen = signal(false);
  protected readonly confirmMessage = signal('');
  private confirmAction: 'delete' | 'clear-all' = 'delete';

  protected readonly filteredItems = computed(() =>
    filterHistoryItems(this.historyService.items(), this.searchQueryDebounced()),
  );

  protected readonly groupedHistory = computed(() =>
    groupHistoryItems(this.filteredItems(), this.collapsedByDate()),
  );

  protected readonly hasEntries = computed(() => this.historyService.items().length > 0);

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

  protected readonly allCollapsed = computed(() => {
    const groups = this.groupedHistory();
    return groups.length > 0 && groups.every((g) => g.collapsed);
  });

  protected handleSearch(query: string): void {
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQueryDebounced.set(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleCollapseAll(): void {
    const groups = this.groupedHistory();
    const expand = this.allCollapsed();
    const next: Record<string, boolean> = {};
    for (const group of groups) {
      next[group.dateKey] = expand ? false : true;
    }
    this.collapsedByDate.set(next);
  }

  protected handleClearHistory(): void {
    this.openClearAllConfirm();
  }

  protected handleToggleGroup(dateKey: string): void {
    this.collapsedByDate.update((state) => ({
      ...state,
      [dateKey]: !(state[dateKey] ?? false),
    }));
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
}

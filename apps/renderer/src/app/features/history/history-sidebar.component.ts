import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  HISTORY_GROUP_BY,
  HISTORY_GROUP_BY_LABELS,
  HISTORY_STATUS_CLASSES,
  HISTORY_STATUS_CLASS_LABELS,
  HTTP_METHODS,
  historyStatusClass,
  type HistoryGroupBy,
  type HistoryStatusClass,
  type HttpMethod,
} from '@testrix/contracts';
import { TxEmptyStateComponent, TxHintComponent, TxInputComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { placeToolbarMenu } from '../../core/toolbar-menu-position';
import { DesktopApiService } from '../../core/desktop-api.service';
import { isRangeModifier, isToggleModifier } from '../../core/range-select';
import {
  isEditableKeyboardTarget,
  isModKey,
  shouldDeferToFlowCanvas,
} from '../../core/selection-hotkeys';
import { isOutsideTreePointer } from '../../core/tree-selection';
import { WorkbenchStore } from '../workbench/workbench.store';
import { CookieJarStore } from '../workbench/request/cookie-jar.store';
import { sendHistoryEntryAgain } from './history-resend';
import { HistoryStore } from './history.store';

type MenuId = 'filter' | 'group' | null;

interface MenuPosition {
  readonly top: number;
  readonly left: number;
  readonly maxHeight: number;
  readonly width: number;
}

const MENU_WIDTH = 180;

@Component({
  selector: 'tx-history-sidebar',
  standalone: true,
  imports: [TxEmptyStateComponent, TxHintComponent, TxInputComponent],
  templateUrl: './history-sidebar.component.html',
  styleUrl: './history-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistorySidebarComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly confirm = inject(ConfirmDialogService);
  readonly store = inject(HistoryStore);
  private readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly cookies = inject(CookieJarStore);

  readonly openMenu = signal<MenuId>(null);
  readonly resendingId = signal<string | null>(null);
  readonly menuPosition = signal<MenuPosition | null>(null);
  readonly httpMethods = HTTP_METHODS;
  readonly statusClasses = HISTORY_STATUS_CLASSES;
  readonly groupOptions = HISTORY_GROUP_BY;

  readonly groupLabel = computed(() => HISTORY_GROUP_BY_LABELS[this.store.groupBy()]);

  readonly activeEntryId = computed(() => {
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    return tab?.kind === 'history' ? tab.nodeId : null;
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  handleSearch(value: string): void {
    if (this.searchTimer)
      clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.store.setSearchQuery(value);
    }, 160);
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.tx-history-sidebar__row, button, input, tx-hint'))
      return;
    this.store.clearSelection();
  }

  handleSelect(id: string, event: MouseEvent): void {
    this.store.applyPointerSelect(id, event);
    if (isRangeModifier(event) || isToggleModifier(event))
      return;
    this.handleOpen(id);
  }

  handleOpen(id: string): void {
    const entry = this.store.entryById(id);
    if (!entry)
      return;
    this.workbench.openFromHistory(entry);
  }

  handleSendAgain(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const entry = this.store.entryById(id);
    if (!entry || this.resendingId())
      return;
    this.resendingId.set(id);
    void sendHistoryEntryAgain({
      entry,
      desktop: this.desktop,
      history: this.store,
      cookies: this.cookies.cookies(),
      mergeCookies: (rows) => this.cookies.merge(rows),
    }).finally(() => {
      if (this.resendingId() === id)
        this.resendingId.set(null);
    });
  }

  handleGroup(mode: HistoryGroupBy): void {
    this.store.setGroupBy(mode);
    this.handleCloseMenus();
  }

  handleToggleMethod(method: HttpMethod): void {
    this.store.toggleMethod(method);
  }

  handleToggleStatus(status: HistoryStatusClass): void {
    this.store.toggleStatusClass(status);
  }

  handleClearFilters(): void {
    this.store.clearFilters();
  }

  async handleClearHistory(): Promise<void> {
    this.handleCloseMenus();
    if (this.store.entries().length === 0)
      return;
    const ok = await this.confirm.ask({
      title: 'Clear history',
      body: 'Remove every sent request from this workspace history? Open history tabs close as well. This cannot be undone.',
      confirmLabel: 'Clear',
    });
    if (!ok)
      return;
    const ids = [...this.store.ids()];
    this.workbench.closeHistoryTabs(ids);
    await this.store.clear();
  }

  handleToggleMenu(menu: Exclude<MenuId, null>, event: MouseEvent): void {
    event.stopPropagation();
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement))
      return;
    this.openMenu.update((current) => {
      if (current === menu)
        return null;
      this.menuPosition.set(this.computeMenuPosition(trigger));
      return menu;
    });
  }

  handleCloseMenus(): void {
    this.openMenu.set(null);
  }

  statusLabel(status: HistoryStatusClass): string {
    return HISTORY_STATUS_CLASS_LABELS[status];
  }

  groupOptionLabel(mode: HistoryGroupBy): string {
    return HISTORY_GROUP_BY_LABELS[mode];
  }

  statusTone(status: number, error: string | null): string {
    return historyStatusClass(status, error);
  }

  timeLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
      return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  @HostListener('document:pointerdown', ['$event'])
  handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target))
      return;
    this.handleCloseMenus();
    if (!isOutsideTreePointer(this.host.nativeElement, event))
      return;
    if (this.store.selectedIds().length === 0)
      return;
    this.store.clearSelection();
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    if (this.openMenu())
      this.handleCloseMenus();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.openMenu()) {
        event.preventDefault();
        this.handleCloseMenus();
        return;
      }
      if (this.store.selectedIds().length === 0)
        return;
      event.preventDefault();
      this.store.clearSelection();
      return;
    }

    if (this.openMenu())
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = [...this.store.selectedIds()];
      if (ids.length === 0)
        return;
      event.preventDefault();
      void this.deleteIds(ids);
      return;
    }

    if (isModKey(event, 'a')) {
      const ids = this.store.visibleIds();
      if (ids.length === 0)
        return;
      event.preventDefault();
      this.store.selectAllVisible();
    }
  }

  private async deleteIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? 'Delete history entry' : `Delete ${ids.length} history entries?`,
      body: 'Remove these snapshots from history? Open history tabs close as well. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    this.workbench.closeHistoryTabs(ids);
    await this.store.removeMany(ids);
  }

  private computeMenuPosition(trigger: HTMLElement): MenuPosition {
    return placeToolbarMenu(trigger, MENU_WIDTH);
  }
}

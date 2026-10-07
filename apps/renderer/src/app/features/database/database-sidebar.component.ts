import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import {
  databaseConnectionTabNodeId,
  databaseQueryTabNodeId,
  type DatabaseConnectionTreeItem,
  type SavedQueryTreeItem,
} from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, forwardPaddingContextMenu, playLeaveThen } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { isContextMenuLeftOfRow, isSidebarToolbarContext } from '../../core/tree-context-menu';
import {
  isEditableKeyboardTarget,
  isModKey,
  ownsTreeClipboardShortcut,
  shouldDeferToFlowCanvas,
} from '../../core/selection-hotkeys';
import { TreeClipboardService } from '../../core/tree-clipboard.service';
import { WorkbenchStore } from '../workbench/workbench.store';
import { DatabaseDndService } from './database-dnd.service';
import { isDatabaseDraggableNav, type DatabaseNavKind, type DatabaseNavNode } from './database-nav';
import { DatabaseSchemaPickerComponent } from './database-schema-picker.component';
import { DatabaseStore } from './database.store';
import { DatabaseToolbarComponent } from './database-toolbar.component';
import { DatabaseTreeComponent } from './database-tree.component';
import type { DatabaseMenuRequest } from './database-tree-node.component';

interface DatabaseMenu {
  readonly kind: DatabaseNavKind | 'root-connections' | 'root-queries' | 'root-sidebar';
  readonly id: string | null;
  readonly section: 'connections' | 'queries';
  readonly connectionId?: string;
  readonly schema?: string;
}

function databaseMenuHasItems(menu: DatabaseMenu): boolean {
  return (
    menu.kind === 'root-connections' ||
    menu.kind === 'root-queries' ||
    menu.kind === 'root-sidebar' ||
    menu.kind === 'folder' ||
    menu.kind === 'connection' ||
    menu.kind === 'query' ||
    menu.kind === 'schema' ||
    menu.kind === 'group' ||
    menu.kind === 'picker'
  );
}

@Component({
  selector: 'tx-database-sidebar',
  standalone: true,
  imports: [
    DatabaseToolbarComponent,
    DatabaseTreeComponent,
    DatabaseSchemaPickerComponent,
    TxButtonComponent,
    TxEmptyStateComponent,
  ],
  templateUrl: './database-sidebar.component.html',
  styleUrl: './database-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tree-clipboard': 'database' },
})
export class DatabaseSidebarComponent {
  readonly store = inject(DatabaseStore);
  readonly dnd = inject(DatabaseDndService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly clipboard = inject(TreeClipboardService);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('databaseMenu');
  private readonly pickerTemplate = viewChild.required<TemplateRef<unknown>>('schemaPicker');

  readonly menu = signal<DatabaseMenu | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly deleteLabel = computed(() => {
    const menu = this.menu();
    if (!menu?.id)
      return 'Delete';
    const selected =
      menu.section === 'connections' ? this.store.connectionSelectedIds() : this.store.querySelectedIds();
    if (selected.includes(menu.id) && selected.length > 1)
      return 'Delete selected';
    return 'Delete';
  });
  private overlayRef: OverlayRef | null = null;
  private pickerOverlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;
  private renameDraft = '';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.closeMenu(true);
      this.closePickerOverlay();
    });
    effect(() => {
      this.dnd.registerSurface(
        this.rootRef()?.nativeElement ?? null,
        this.scrollerRef()?.nativeElement ?? null,
      );
    });
    effect(() => {
      if (this.store.dragNode())
        this.closeMenu(true);
    });
    effect(() => {
      if (!this.store.pickerConnectionId())
        this.closePickerOverlay();
    });
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-node-id], button, input, tx-hint'))
      return;
    this.store.clearSelection();
  }

  handleChromeMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!isSidebarToolbarContext(event))
      return;
    this.openMenu(event, { kind: 'root-sidebar', id: null, section: 'connections' });
  }

  handleRootMenu(event: MouseEvent, section: 'connections' | 'queries'): void {
    if (forwardPaddingContextMenu(event))
      return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-node-id]'))
      return;
    this.openMenu(event, {
      kind: section === 'connections' ? 'root-connections' : 'root-queries',
      id: null,
      section,
    });
  }

  handleItemMenu(request: DatabaseMenuRequest): void {
    if (isContextMenuLeftOfRow(request.event)) {
      this.openMenu(request.event, {
        kind: request.node.section === 'connections' ? 'root-connections' : 'root-queries',
        id: null,
        section: request.node.section,
      });
      return;
    }
    const selected =
      request.node.section === 'connections'
        ? this.store.connectionSelectedIds()
        : this.store.querySelectedIds();
    if (!selected.includes(request.node.id)) {
      this.store.applyPointerSelect(request.node.id, request.node.section, {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      });
    }
    this.openMenu(request.event, {
      kind: request.node.kind,
      id: request.node.id,
      section: request.node.section,
      connectionId: request.node.connectionId,
      schema: request.node.schema,
    });
  }

  handleNewFolder(section: 'connections' | 'queries'): void {
    const parentId = this.menu()?.kind === 'folder' ? this.menu()?.id ?? null : null;
    this.closeMenu();
    this.store.setSearchQuery('');
    const node =
      section === 'connections'
        ? this.store.createConnection('folder', parentId)
        : this.store.createQuery('folder', parentId);
    this.startRename(node.id);
  }

  handleNewConnection(): void {
    const parentId = this.menu()?.kind === 'folder' ? this.menu()?.id ?? null : null;
    this.closeMenu();
    this.store.setSearchQuery('');
    const connection = this.store.createPendingConnection(parentId);
    this.workbench.openFromDatabaseConnection(connection);
  }

  handleNewQuery(connectionId?: string): void {
    const menu = this.menu();
    const parentId = menu?.kind === 'folder' && menu.section === 'queries' ? menu.id : null;
    const fromConnection =
      connectionId ??
      (menu?.kind === 'connection' || menu?.kind === 'schema' || menu?.kind === 'group'
        ? menu.connectionId ?? (menu.kind === 'connection' ? menu.id ?? '' : '')
        : '');
    this.closeMenu();
    this.store.setSearchQuery('');
    const node = this.store.createQuery('query', parentId, fromConnection ?? '');
    const query = this.store.queryById(node.id);
    if (query)
      this.workbench.openFromDatabaseQuery(query);
    this.startRename(node.id);
  }

  handleOpen(): void {
    const menu = this.menu();
    this.closeMenu();
    if (!menu?.id)
      return;
    if (menu.kind === 'connection') {
      const connection = this.store.connectionById(menu.id);
      if (connection)
        this.workbench.openFromDatabaseConnection(connection);
      return;
    }
    if (menu.kind === 'query') {
      const query = this.store.queryById(menu.id);
      if (query)
        this.workbench.openFromDatabaseQuery(query);
    }
  }

  handleRefresh(): void {
    const menu = this.menu();
    this.closeMenu();
    const id = menu?.connectionId ?? (menu?.kind === 'connection' ? menu.id : null);
    if (id)
      void this.store.refreshConnection(id);
  }

  async handleTest(): Promise<void> {
    const id = this.menu()?.id;
    this.closeMenu();
    const connection = id ? this.store.connectionById(id) : null;
    if (!connection)
      return;
    const error = await this.store.testConnection(connection);
    if (error) {
      await this.confirm.ask({
        title: 'Connection failed',
        body: error,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
    }
  }

  handleOpenPicker(request: { readonly connectionId: string; readonly event: MouseEvent | KeyboardEvent }): void {
    const target = request.event.target;
    const match = target instanceof Element ? target.closest('[data-node-id]') : null;
    this.openPickerAt(request.connectionId, match instanceof HTMLElement ? match : null);
  }

  handleSchemas(): void {
    const menu = this.menu();
    this.closeMenu();
    const id = menu?.connectionId ?? (menu?.kind === 'connection' || menu?.kind === 'picker' ? menu.id : null);
    if (!id)
      return;
    const picker = this.host.nativeElement.querySelector(`[data-node-id="picker:${id}"]`);
    const connection = this.host.nativeElement.querySelector(`[data-node-id="${id}"]`);
    const origin = picker instanceof HTMLElement ? picker : connection instanceof HTMLElement ? connection : null;
    this.openPickerAt(id, origin);
  }

  handleShowDiagram(): void {
    const menu = this.menu();
    this.closeMenu();
    const node = menu?.id ? this.store.navNodeById(menu.id) : null;
    const connectionId = menu?.connectionId ?? (menu?.kind === 'connection' ? menu.id : node?.connectionId);
    const schema = menu?.schema ?? node?.schema;
    if (!connectionId || !schema)
      return;
    const connection = this.store.connectionById(connectionId);
    this.workbench.openFromDatabaseDiagram(
      { connectionId, schema },
      connection ? `${connection.name} · ${schema}` : schema,
    );
    void this.store.loadSchemaObjects(connectionId, schema);
  }

  handleDisconnect(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (id)
      void this.store.disconnect(id);
  }

  handleRenameFromMenu(): void {
    const id = this.menu()?.id;
    this.closeMenu();
    if (id)
      this.startRename(id);
  }

  handleDuplicate(): void {
    const menu = this.menu();
    this.closeMenu();
    if (!menu?.id)
      return;
    this.store.setSearchQuery('');
    const node = this.store.duplicate(menu.id, menu.section);
    if (node)
      this.startRename(node.id);
  }

  async handleDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu();
    if (!menu)
      return;
    const selected =
      menu.section === 'connections' ? this.store.connectionSelectedIds() : this.store.querySelectedIds();
    const targetId = menu.id;
    const ids =
      targetId && selected.includes(targetId) && selected.length > 1 ? [...selected] : targetId ? [targetId] : [];
    await this.deleteIds(ids, menu.section);
  }

  private async deleteIds(
    ids: readonly string[],
    section: 'connections' | 'queries',
  ): Promise<void> {
    if (ids.length === 0)
      return;
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? 'Delete' : 'Delete selected',
      body: 'This removes the selected items from this workspace.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    const removed = this.store.remove(ids, section);
    const tabIds = new Set(
      removed.flatMap((id) => [databaseConnectionTabNodeId(id), databaseQueryTabNodeId(id)]),
    );
    this.workbench.closeDatabaseTabs(tabIds);
  }

  handleOpenTable(node: DatabaseNavNode): void {
    if (!node.connectionId || !node.table)
      return;
    this.workbench.openFromDatabaseTable(
      { connectionId: node.connectionId, schema: node.schema ?? '', table: node.table },
      node.schema ? `${node.schema}.${node.table}` : node.table,
    );
  }

  startRename(id: string): void {
    const node = this.store.navNodeById(id);
    if (!node || !isDatabaseDraggableNav(node))
      return;
    this.renameDraft = node.name;
    this.renamingId.set(id);
    this.closeMenu();
    afterNextRender(
      () => {
        const match = this.host.nativeElement.querySelector(`[data-database-rename="${id}"]`);
        if (match instanceof HTMLInputElement) {
          match.focus();
          match.select();
        }
      },
      { injector: this.injector },
    );
  }

  handleRenameInput(event: { readonly id: string; readonly value: string }): void {
    this.renameDraft = event.value;
  }

  handleRenameKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== 'Escape')
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.renamingId.set(null);
      return;
    }
    this.finishRename();
  }

  finishRename(): void {
    const id = this.renamingId();
    this.renamingId.set(null);
    if (!id)
      return;
    const node = this.store.navNodeById(id);
    const name = this.renameDraft.trim() || node?.name || 'Item';
    if (!node)
      return;
    this.store.rename(id, name, node.section);
    if (node.kind === 'connection')
      this.workbench.renameDatabaseConnectionTabs(id, name);
    if (node.kind === 'query')
      this.workbench.renameDatabaseQueryTabs(id, name);
  }

  closeMenu(immediate = false): void {
    const overlayRef = this.overlayRef;
    this.menuCloseToken += 1;
    const token = this.menuCloseToken;
    if (!overlayRef) {
      this.menu.set(null);
      return;
    }
    const dispose = (): void => {
      if (token !== this.menuCloseToken)
        return;
      overlayRef.dispose();
      if (this.overlayRef === overlayRef) {
        this.overlayRef = null;
        this.menu.set(null);
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }

  @HostListener('window:resize')
  handleWindowResize(): void {
    this.closeMenu();
    this.store.closeSchemaPicker();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.store.pickerConnectionId()) {
        event.preventDefault();
        this.store.closeSchemaPicker();
        return;
      }
      if (this.menu()) {
        event.preventDefault();
        this.closeMenu();
        return;
      }
      if (this.renamingId()) {
        event.preventDefault();
        this.renamingId.set(null);
        return;
      }
      if (
        this.store.connectionSelectedIds().length === 0 &&
        this.store.querySelectedIds().length === 0
      )
        return;
      event.preventDefault();
      this.store.clearSelection();
      return;
    }

    if (this.menu() || this.renamingId() || this.store.pickerConnectionId())
      return;
    if (isEditableKeyboardTarget(event.target))
      return;
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const conn = [...this.store.connectionSelectedIds()];
      const query = [...this.store.querySelectedIds()];
      if (conn.length === 0 && query.length === 0)
        return;
      event.preventDefault();
      if (conn.length > 0)
        void this.deleteIds(conn, 'connections');
      else
        void this.deleteIds(query, 'queries');
      return;
    }

    if (isModKey(event, 'a')) {
      event.preventDefault();
      const preferQueries = this.store.querySelectedIds().length > 0;
      this.store.selectAllVisible(preferQueries ? 'queries' : 'connections');
      return;
    }

    if (isModKey(event, 'd')) {
      const conn = [...this.store.connectionSelectedIds()];
      const query = [...this.store.querySelectedIds()];
      const section = conn.length > 0 ? 'connections' : query.length > 0 ? 'queries' : null;
      const ids = section === 'connections' ? conn : query;
      if (!section || ids.length === 0)
        return;
      event.preventDefault();
      this.store.setSearchQuery('');
      for (const id of ids)
        this.store.duplicate(id, section);
      return;
    }

    if (!ownsTreeClipboardShortcut(this.host.nativeElement, event, true))
      return;

    if (isModKey(event, 'c') && !event.shiftKey) {
      const connections = this.store.copyConnections();
      if (connections.length > 0) {
        event.preventDefault();
        this.clipboard.set({ kind: 'database', section: 'connections', nodes: connections });
        return;
      }
      const queries = this.store.copyQueries();
      if (queries.length === 0)
        return;
      event.preventDefault();
      this.clipboard.set({ kind: 'database', section: 'queries', nodes: queries });
      return;
    }

    if (isModKey(event, 'v') && !event.shiftKey) {
      const memory = this.clipboard.peek('database');
      if (memory) {
        event.preventDefault();
        this.pasteDatabase(memory.section, memory.nodes);
        return;
      }
      void this.clipboard.get('database').then((payload) => {
        if (payload)
          this.pasteDatabase(payload.section, payload.nodes);
      });
    }
  }

  private pasteDatabase(section: 'connections' | 'queries', nodes: readonly unknown[]): void {
    this.store.setSearchQuery('');
    if (section === 'connections')
      this.store.pasteConnections(nodes as readonly DatabaseConnectionTreeItem[]);
    else
      this.store.pasteQueries(nodes as readonly SavedQueryTreeItem[]);
  }

  private openMenu(event: MouseEvent, partial: DatabaseMenu): void {
    event.preventDefault();
    event.stopPropagation();
    if (!databaseMenuHasItems(partial))
      return;
    this.closeMenu(true);
    this.menu.set(partial);
    const x = event.clientX;
    const y = event.clientY;
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.overlayRef === overlayRef)
        this.placeMenu(overlayRef, position, x, y);
    });
    window.setTimeout(() => {
      if (this.overlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-database-menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 210;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 220;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  private openPickerAt(connectionId: string, origin: HTMLElement | null): void {
    this.store.openSchemaPicker(connectionId);
    this.closePickerOverlay();
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.pickerTemplate(), this.vcr));
    this.pickerOverlayRef = overlayRef;
    const place = (): void => this.placePicker(overlayRef, position, origin);
    place();
    requestAnimationFrame(() => {
      if (this.pickerOverlayRef === overlayRef)
        place();
    });
    window.setTimeout(() => {
      if (this.pickerOverlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.store.closeSchemaPicker());
    });
  }

  private placePicker(
    overlayRef: OverlayRef,
    position: GlobalPositionStrategy,
    origin: HTMLElement | null,
  ): void {
    const panel = overlayRef.overlayElement.querySelector('.tx-database-picker');
    const width = panel instanceof HTMLElement && panel.offsetWidth ? panel.offsetWidth : 260;
    const height = panel instanceof HTMLElement && panel.offsetHeight ? panel.offsetHeight : 220;
    const margin = 8;
    const gap = 6;
    const bounds =
      this.host.nativeElement.closest('.tx-sidebar')?.getBoundingClientRect() ??
      this.host.nativeElement.getBoundingClientRect();
    const originRect = origin?.getBoundingClientRect();
    let left = originRect?.left ?? bounds.left + margin;
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(left, margin);
    const below = (originRect?.bottom ?? bounds.top) + gap;
    const above = (originRect?.top ?? bounds.bottom) - height - gap;
    const top =
      below + height > window.innerHeight - margin && above > margin
        ? Math.max(margin, above)
        : Math.min(below, window.innerHeight - height - margin);
    position.left(`${Math.round(left)}px`).top(`${Math.round(Math.max(margin, top))}px`);
    overlayRef.updatePosition();
  }

  private closePickerOverlay(): void {
    this.pickerOverlayRef?.dispose();
    this.pickerOverlayRef = null;
  }
}

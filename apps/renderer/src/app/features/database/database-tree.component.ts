import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TxDraggableDirective, TxHintComponent, type TxDragEndEvent, type TxDragMoveEvent, type TxDragStartEvent } from '@testrix/ui';

import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../core/range-select';
import { WorkbenchStore } from '../workbench/workbench.store';
import {
  DATABASE_CATALOG_FILTER_MIN,
  DATABASE_CATALOG_PAGE_SIZE,
  catalogSearchReveals,
  filterCatalogChildren,
  isPagedCatalogNode,
  pageCatalogChildren,
  type CatalogPage,
} from './database-catalog-page';
import { DatabaseDndService } from './database-dnd.service';
import { isDatabaseDraggableNav, isDatabaseExpandableNav, catalogTableKey, type DatabaseNavNode } from './database-nav';
import { DatabaseStore } from './database.store';
import {
  DatabaseTreeNodeComponent,
  type DatabaseMenuRequest,
  type DatabaseReorderRequest,
  type DatabaseSelectRequest,
} from './database-tree-node.component';
import { DatabaseTypeIconComponent } from './database-type-icon.component';

@Component({
  selector: 'tx-database-tree',
  standalone: true,
  imports: [TxDraggableDirective, DatabaseTreeNodeComponent, DatabaseTreeComponent, DatabaseTypeIconComponent, TxHintComponent],
  templateUrl: './database-tree.component.html',
  styleUrl: './database-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseTreeComponent {
  readonly store = inject(DatabaseStore);
  readonly dnd = inject(DatabaseDndService);
  readonly workbench = inject(WorkbenchStore);

  readonly nodes = input.required<readonly DatabaseNavNode[]>();
  readonly parentId = input<string | null>(null);
  readonly depth = input(0);
  readonly renamingId = input<string | null>(null);
  readonly nodeMenu = output<DatabaseMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();
  readonly openPicker = output<{ readonly connectionId: string; readonly event: MouseEvent | KeyboardEvent }>();
  readonly openTable = output<DatabaseNavNode>();
  readonly openDdl = output<DatabaseNavNode>();

  readonly dragDisabled = computed(() => !this.store.canDrag());

  handleToggle(id: string): void {
    this.store.toggleExpanded(id);
    if (!this.store.isExpanded(id))
      return;
    const node = this.store.navNodeById(id);
    if (node?.kind === 'schema' && node.connectionId && node.schema) {
      void this.store.loadSchemaObjects(node.connectionId, node.schema);
      return;
    }
    if (node?.kind !== 'table' && node?.kind !== 'view')
      return;
    for (const child of node.children ?? [])
      this.store.ensureExpanded(child.id);
    void this.store.loadTableDetails(node.connectionId ?? '', node.schema ?? '', node.table ?? '');
  }

  handleSelect(request: DatabaseSelectRequest): void {
    const { node, event } = request;
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds:
          node.section === 'connections' ? this.store.connectionSelectedIds() : this.store.querySelectedIds(),
        targetId: node.id,
      })
    )
      return;
    this.store.applyPointerSelect(node.id, node.section, event);
    if (isRangeModifier(event) || isToggleModifier(event))
      return;
    if (node.kind === 'picker' && node.connectionId) {
      this.openPicker.emit({ connectionId: node.connectionId, event });
      return;
    }
    if (this.openNode(node))
      return;
    if (!isDatabaseExpandableNav(node))
      return;
    if (event instanceof KeyboardEvent) {
      this.handleToggle(node.id);
      return;
    }
    if (!this.store.isExpanded(node.id)) {
      this.handleToggle(node.id);
      return;
    }
    if (node.kind === 'connection' || node.kind === 'schema')
      this.store.ensureExpanded(node.id);
  }

  handleReorder(request: DatabaseReorderRequest): void {
    const node = this.store.navNodeById(request.id);
    if (!node || !isDatabaseDraggableNav(node))
      return;
    this.dnd.reorder(request.id, request.direction, node.section);
  }

  handleDragStarted(event: TxDragStartEvent<DatabaseNavNode>): void {
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<DatabaseNavNode>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<DatabaseNavNode>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  isExpanded(node: DatabaseNavNode): boolean {
    if (this.store.isExpanded(node.id))
      return true;
    return catalogSearchReveals(node, this.store.searchQuery());
  }

  isNodeOpen(id: string): boolean {
    return this.workbench.openNodeIds().has(this.tabNodeId(id));
  }

  isNodeActive(id: string): boolean {
    const focused = this.workbench.focusedGroup();
    const tab = focused?.tabs.find((item) => item.id === focused.activeTabId);
    return tab?.nodeId === this.tabNodeId(id);
  }

  isDropFolder(id: string): boolean {
    return this.store.dropTarget()?.folderId === id;
  }

  isJustMoved(id: string): boolean {
    return this.store.lastMovedId() === id;
  }

  canDrag(node: DatabaseNavNode): boolean {
    return isDatabaseDraggableNav(node) && !this.dragDisabled();
  }

  isBusy(node: DatabaseNavNode): boolean {
    if (node.kind === 'connection' && node.connectionId)
      return this.store.isCatalogBusy(node.connectionId);
    if (node.kind === 'schema' && node.connectionId && node.schema)
      return this.store.isCatalogBusy(this.store.schemaBusyKey(node.connectionId, node.schema));
    if ((node.kind === 'table' || node.kind === 'view') && node.connectionId && node.table)
      return this.store.isCatalogBusy(this.store.tableBusyKey(node.connectionId, node.schema ?? '', node.table));
    return false;
  }

  childrenOf(node: DatabaseNavNode): readonly DatabaseNavNode[] {
    return this.catalogPage(node).visible;
  }

  showCatalogFilter(node: DatabaseNavNode): boolean {
    return isPagedCatalogNode(node) && (node.children?.length ?? 0) >= DATABASE_CATALOG_FILTER_MIN;
  }

  catalogFilterPlaceholder(node: DatabaseNavNode): string {
    return node.kind === 'connection' ? 'Filter schemas' : `Filter ${node.name}`;
  }

  catalogRemaining(node: DatabaseNavNode): number {
    return this.catalogPage(node).remaining;
  }

  handleCatalogFilter(node: DatabaseNavNode, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.store.setCatalogQuery(node.id, target.value);
  }

  handleLoadMore(node: DatabaseNavNode, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.loadMoreCatalog(node.id, this.catalogPage(node).total);
  }

  nextCatalogChunk(node: DatabaseNavNode): number {
    return Math.min(DATABASE_CATALOG_PAGE_SIZE, this.catalogRemaining(node));
  }

  private catalogPage(node: DatabaseNavNode): CatalogPage {
    const children = node.children ?? [];
    if (!isPagedCatalogNode(node))
      return { visible: children, total: children.length, remaining: 0 };
    const filtered = filterCatalogChildren(children, this.store.catalogQuery(node.id));
    return pageCatalogChildren(filtered, this.store.catalogLimit(node.id));
  }

  dragCount(): number {
    return Math.max(1, this.store.dragIds().length);
  }

  private tabNodeId(id: string): string {
    const connection = this.store.connectionById(id);
    if (connection)
      return `dbc:${id}`;
    const query = this.store.queryById(id);
    if (query)
      return `dbq:${id}`;
    return id;
  }

  private openNode(node: DatabaseNavNode): boolean {
    if (node.kind === 'query') {
      const query = this.store.queryById(node.id);
      if (!query)
        return false;
      this.workbench.openFromDatabaseQuery(query);
      return true;
    }
    if (node.kind === 'table' || node.kind === 'view') {
      this.openTable.emit(node);
      return true;
    }
    if (node.kind === 'fk' && node.connectionId && node.referencedTableName) {
      const schema = node.referencedSchema || node.schema || '';
      const table = node.referencedTableName;
      this.store.ensureExpanded(node.connectionId);
      this.store.ensureExpanded(`schema:${node.connectionId}:${schema}`);
      this.store.ensureExpanded(`table:${node.connectionId}:${catalogTableKey(schema, table)}`);
      this.openTable.emit({
        ...node,
        id: `table:${node.connectionId}:${catalogTableKey(schema, table)}`,
        kind: 'table',
        name: table,
        schema,
        table,
      });
      return true;
    }
    return false;
  }
}

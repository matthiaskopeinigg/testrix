import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { PlantumlDiagramKind, PlantumlNode } from '@testrix/contracts';
import { isContextMenuLeftOfRow, isSidebarToolbarContext } from '../../../core/tree-context-menu';
import {
  TxDraggableDirective,
  TxEmptyStateComponent,
  forwardPaddingContextMenu,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../../core/range-select';
import { PlantumlDndService } from './plantuml-dnd.service';
import { PlantumlStore } from './plantuml.store';
import { PlantumlToolbarComponent } from './plantuml-toolbar.component';

const KIND_MARKS: Readonly<Record<PlantumlDiagramKind, string>> = {
  sequence: 'Seq',
  class: 'Class',
  activity: 'Act',
  usecase: 'Use',
  component: 'Cmp',
  state: 'State',
  freeform: 'Src',
};

@Component({
  selector: 'tx-plantuml-list-pane',
  standalone: true,
  imports: [TxDraggableDirective, TxEmptyStateComponent, PlantumlToolbarComponent],
  templateUrl: './plantuml-list-pane.component.html',
  styleUrl: './plantuml-list-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlantumlListPaneComponent {
  readonly store = inject(PlantumlStore);
  readonly dnd = inject(PlantumlDndService);
  readonly renamingId = signal<string | null>(null);
  readonly menu = output<{ readonly node: PlantumlNode | null; readonly event: MouseEvent }>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly flipRoot = viewChild<ElementRef<HTMLElement>>('flipRoot');

  readonly dragDisabled = computed(
    () => this.store.search().trim().length > 0 || this.store.isFilterActive(),
  );

  constructor() {
    afterNextRender(() => this.registerSurface());
  }

  handleChevron(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.store.toggleExpanded(id);
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-node-id], button, input, tx-hint'))
      return;
    this.store.clearSelection();
  }

  handleRowClick(node: PlantumlNode, event: MouseEvent): void {
    event.stopPropagation();
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.store.selectedIds(),
        targetId: node.id,
      })
    ) {
      return;
    }

    this.store.applyPointerSelect(node.id, event);
    if (isRangeModifier(event) || isToggleModifier(event))
      return;

    if (node.kind === 'folder') {
      this.store.toggleExpanded(node.id);
      return;
    }
    this.store.openDiagram(node.id, node.name);
  }

  handleRowMenu(node: PlantumlNode, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (isContextMenuLeftOfRow(event)) {
      this.menu.emit({ node: null, event });
      return;
    }
    if (!this.store.selectedIds().includes(node.id))
      this.store.select(node.id);
    this.menu.emit({ node, event });
  }

  handleEmptyMenu(event: MouseEvent): void {
    if (forwardPaddingContextMenu(event))
      return;
    const target = event.target;
    if (!(target instanceof Element))
      return;
    if (target.closest('[data-node-id], .tx-menu'))
      return;
    if (!isSidebarToolbarContext(event) && target.closest('input, textarea, select, button'))
      return;
    event.preventDefault();
    this.menu.emit({ node: null, event });
  }

  startRename(id: string): void {
    this.renamingId.set(id);
  }

  finishRename(): void {
    this.renamingId.set(null);
  }

  handleRenameInput(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const name = target.value.trim();
    if (!name)
      return;
    void this.store.rename(id, name);
    this.finishRename();
  }

  handleDragStarted(event: TxDragStartEvent<PlantumlNode>): void {
    this.registerSurface();
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<PlantumlNode>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<PlantumlNode>): void {
    void this.dnd.end(event.reason, event.releaseRect);
  }

  isExpanded(id: string): boolean {
    const reveal = this.store.search().trim().length > 0 || this.store.isFilterActive();
    return reveal || this.store.expandedIds().includes(id);
  }

  isActive(id: string): boolean {
    return this.store.activeId() === id;
  }

  isSelected(id: string): boolean {
    return this.store.selectedIds().includes(id);
  }

  isDropFolder(id: string): boolean {
    return this.store.isDropFolder(id);
  }

  isJustMoved(id: string): boolean {
    return this.store.isJustMoved(id);
  }

  kindOf(node: PlantumlNode): PlantumlDiagramKind {
    return node.kind === 'artifact' ? node.diagramKind : 'freeform';
  }

  kindMark(kind: PlantumlDiagramKind): string {
    return KIND_MARKS[kind];
  }

  rowLabel(node: PlantumlNode): string {
    if (node.kind === 'folder')
      return this.isExpanded(node.id) ? `Collapse ${node.name}` : `Expand ${node.name}`;
    return `Open ${this.kindMark(node.diagramKind)} ${node.name}`;
  }

  private registerSurface(): void {
    this.dnd.registerSurface(
      this.flipRoot()?.nativeElement ?? null,
      this.scroller()?.nativeElement ?? null,
    );
  }
}

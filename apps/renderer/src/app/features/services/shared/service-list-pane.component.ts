import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ServiceId, ServiceTreeNode } from '@testrix/contracts';
import {
  TxButtonComponent,
  TxEmptyStateComponent,
  forwardPaddingContextMenu,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { isSidebarToolbarContext } from '../../../core/tree-context-menu';
import { ServicesDndService } from '../services-dnd.service';
import { type ServicesStore } from '../services.store';
import { FlowTemplatesPanelComponent } from '../flows/flow-templates-panel.component';
import { FlowTemplatesStore } from '../flows/flow-templates.store';
import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../../core/range-select';
import { ServiceToolbarComponent } from './service-toolbar.component';
import { ServiceTreeNodeComponent } from './service-tree-node.component';

@Component({
  selector: 'tx-service-list-pane',
  standalone: true,
  imports: [
    ServiceToolbarComponent,
    ServiceTreeNodeComponent,
    TxButtonComponent,
    TxEmptyStateComponent,
    FlowTemplatesPanelComponent,
  ],
  templateUrl: './service-list-pane.component.html',
  styleUrl: './service-list-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceListPaneComponent {
  readonly serviceId = input.required<ServiceId>();
  readonly store = input.required<ServicesStore>();
  readonly noun = input('item');
  readonly hideFolder = input(false);
  readonly menu = output<{ readonly node: ServiceTreeNode<Record<string, unknown>>; readonly event: MouseEvent }>();
  readonly emptyMenu = output<MouseEvent>();
  readonly renamingId = input<string | null>(null);
  readonly rename = output<{ readonly id: string; readonly name: string }>();
  readonly renameDone = output<void>();

  readonly dnd = inject(ServicesDndService);
  readonly templatesStore = inject(FlowTemplatesStore);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly flipRoot = viewChild<ElementRef<HTMLElement>>('flipRoot');

  readonly dragDisabled = computed(
    () =>
      !!this.store().search(this.serviceId()).trim() ||
      this.store().isTagFilterActive(this.serviceId()),
  );
  readonly templatesOpen = computed(
    () => this.serviceId() === 'flows' && this.templatesStore.panelOpen(),
  );
  readonly emptyTitle = computed(() => {
    const store = this.store();
    const id = this.serviceId();
    if (store.search(id).trim() || store.isTagFilterActive(id))
      return 'No matches';
    return 'Nothing here';
  });
  readonly emptyBody = computed(() => {
    const store = this.store();
    const id = this.serviceId();
    if (store.search(id).trim() || store.isTagFilterActive(id))
      return 'Try a different search or clear filters.';
    return `Right-click to create a ${this.noun()}.`;
  });

  readonly showEmptyPrimary = computed(() => {
    const store = this.store();
    const id = this.serviceId();
    return id === 'flows' && !store.search(id).trim() && !store.isTagFilterActive(id);
  });

  readonly emptyPrimary = output<void>();

  constructor() {
    afterNextRender(() => this.registerSurface());
  }

  handleToolbarMenu(event: MouseEvent): void {
    if (!isSidebarToolbarContext(event))
      return;
    event.preventDefault();
    event.stopPropagation();
    this.emptyMenu.emit(event);
  }

  handleEmptyMenu(event: MouseEvent): void {
    if (forwardPaddingContextMenu(event))
      return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-node-id]'))
      return;
    event.preventDefault();
    this.emptyMenu.emit(event);
  }

  /** Click empty chrome clears the multi-select highlight. */
  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-node-id], button, input, tx-hint'))
      return;
    this.store().clearSelection();
  }

  handleSelect(payload: {
    readonly node: ServiceTreeNode<Record<string, unknown>>;
    readonly event: MouseEvent;
  }): void {
    const store = this.store();
    const serviceId = this.serviceId();
    const id = payload.node.id;

    if (
      shouldKeepPointerSelection({
        event: payload.event,
        selectedIds: store.selectedIds(),
        targetId: id,
      })
    ) {
      return;
    }

    store.applyPointerSelect(serviceId, id, payload.event);
    if (isRangeModifier(payload.event) || isToggleModifier(payload.event))
      return;

    if (payload.node.kind === 'folder') {
      store.toggleExpanded(serviceId, id);
      return;
    }
    store.openArtifact(serviceId, id, payload.node.name);
  }

  handleDragStarted(event: TxDragStartEvent<ServiceTreeNode<Record<string, unknown>>>): void {
    this.registerSurface();
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<ServiceTreeNode<Record<string, unknown>>>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<ServiceTreeNode<Record<string, unknown>>>): void {
    void this.dnd.end(event.reason, event.releaseRect);
  }

  private registerSurface(): void {
    this.dnd.registerSurface(
      this.serviceId(),
      this.flipRoot()?.nativeElement ?? null,
      this.scroller()?.nativeElement ?? null,
    );
  }
}

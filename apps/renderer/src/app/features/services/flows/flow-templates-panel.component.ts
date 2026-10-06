import { type GlobalPositionStrategy, Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import { parseFlowTemplateGroupNodeId } from '@testrix/contracts';
import {
  TxDraggableDirective,
  TxEmptyStateComponent,
  TxHintComponent,
  playLeaveThen,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import {
  isEditableKeyboardTarget,
  isModKey,
  ownsTreeClipboardShortcut,
  shouldDeferToFlowCanvas,
} from '../../../core/selection-hotkeys';
import { TreeClipboardService } from '../../../core/tree-clipboard.service';
import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../../core/range-select';
import { ServiceToolbarComponent } from '../shared/service-toolbar.component';
import { FlowTemplatesDndService } from './flow-templates-dnd.service';
import type { FlowTemplateTreeGroup, FlowTemplateTreeLeaf, FlowTemplateTreeNode } from './flow-templates-drop-model';
import { FlowTemplatesStore } from './flow-templates.store';

type TemplatesMenu =
  | { readonly kind: 'root' }
  | { readonly kind: 'group'; readonly tag: string }
  | { readonly kind: 'template'; readonly id: string; readonly name: string };

@Component({
  selector: 'tx-flow-templates-panel',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxHintComponent,
    TxDraggableDirective,
    ServiceToolbarComponent,
  ],
  templateUrl: './flow-templates-panel.component.html',
  styleUrl: './flow-templates-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-tree-clipboard': 'flow-templates', tabindex: '-1' },
})
export class FlowTemplatesPanelComponent {
  readonly store = inject(FlowTemplatesStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly clipboard = inject(TreeClipboardService);
  readonly dnd = inject(FlowTemplatesDndService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('templatesMenu');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly flipRoot = viewChild<ElementRef<HTMLElement>>('flipRoot');

  readonly menu = signal<TemplatesMenu | null>(null);
  private renameDraft = '';
  private groupRenameDraft = '';
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu(true));
    afterNextRender(() => this.registerSurface());
  }

  private registerSurface(): void {
    this.dnd.registerSurface(
      this.flipRoot()?.nativeElement ?? null,
      this.scroller()?.nativeElement ?? null,
    );
  }

  close(): void {
    this.store.closePanel();
  }

  handleChromeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[data-node-id], button, input, tx-hint'))
      return;
    this.store.clearSelection();
  }

  handleGroupClick(group: FlowTemplateTreeGroup, event: MouseEvent): void {
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.store.selectedIds(),
        targetId: group.id,
      })
    )
      return;
    this.store.applyPointerSelect(group.id, event);
    this.claimClipboardFocus();
    if (isRangeModifier(event) || isToggleModifier(event))
      return;
    this.store.toggleGroupExpanded(group.id);
  }

  handleTemplateClick(leaf: FlowTemplateTreeLeaf, event: MouseEvent): void {
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.store.selectedIds(),
        targetId: leaf.id,
      })
    )
      return;
    this.store.applyPointerSelect(leaf.id, event);
    this.claimClipboardFocus();
    if (isRangeModifier(event) || isToggleModifier(event))
      return;
    this.store.openTemplate(leaf.id);
  }

  handleEmptyMenu(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-node-id]'))
      return;
    this.openMenu(event, { kind: 'root' });
  }

  handleGroupMenu(group: FlowTemplateTreeGroup, event: MouseEvent): void {
    if (!this.store.selectedIds().includes(group.id))
      this.store.applyPointerSelect(group.id, event);
    this.openMenu(event, { kind: 'group', tag: group.tag });
  }

  handleItemMenu(leaf: FlowTemplateTreeLeaf, event: MouseEvent): void {
    if (!this.store.selectedIds().includes(leaf.id))
      this.store.applyPointerSelect(leaf.id, event);
    this.openMenu(event, { kind: 'template', id: leaf.id, name: leaf.name });
  }

  handleRenameInput(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.renameDraft = target.value;
    void this.store.rename(id, target.value);
  }

  finishRename(): void {
    const id = this.store.renamingId();
    if (id && this.renameDraft.trim())
      void this.store.rename(id, this.renameDraft.trim());
    this.store.renamingId.set(null);
  }

  startRename(id: string, name: string): void {
    this.renameDraft = name;
    this.store.renamingId.set(id);
  }

  handleGroupRenameInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.groupRenameDraft = target.value;
  }

  finishGroupRename(): void {
    const from = this.store.renamingGroup();
    if (from && this.groupRenameDraft.trim())
      void this.store.renameGroup(from, this.groupRenameDraft.trim());
    this.store.renamingGroup.set(null);
  }

  startGroupRename(tag: string): void {
    this.groupRenameDraft = tag;
    this.store.renamingGroup.set(tag);
  }

  handleDragStarted(event: TxDragStartEvent<FlowTemplateTreeNode>): void {
    this.registerSurface();
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<FlowTemplateTreeNode>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<FlowTemplateTreeNode>): void {
    void this.dnd.end(event.reason, event.releaseRect);
  }

  dragCount(): number {
    return this.store.dragIds().length;
  }

  async handleMenuNewTemplate(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    const group = menu?.kind === 'group' ? menu.tag : null;
    await this.store.createShell('New template', group);
  }

  async handleMenuNewGroup(): Promise<void> {
    this.closeMenu(true);
    await this.store.createGroup();
  }

  handleMenuOpen(): void {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.kind !== 'template')
      return;
    this.store.openTemplate(menu.id);
  }

  handleMenuRename(): void {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu)
      return;
    if (menu.kind === 'template') {
      this.startRename(menu.id, menu.name);
      return;
    }
    if (menu.kind === 'group')
      this.startGroupRename(menu.tag);
  }

  async handleMenuDuplicate(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu || menu.kind !== 'template')
      return;
    const selected = this.store.selectedIds().filter((id) => !parseFlowTemplateGroupNodeId(id));
    const ids =
      selected.includes(menu.id) && selected.length > 1 ? [...selected] : [menu.id];
    for (const id of ids)
      await this.store.duplicate(id);
  }

  async handleMenuDelete(): Promise<void> {
    const menu = this.menu();
    this.closeMenu(true);
    if (!menu)
      return;
    if (menu.kind === 'group') {
      await this.confirmAndDeleteGroup(menu.tag);
      return;
    }
    if (menu.kind !== 'template')
      return;
    const selected = this.store.selectedIds().filter((id) => !parseFlowTemplateGroupNodeId(id));
    const ids =
      selected.includes(menu.id) && selected.length > 1 ? [...selected] : [menu.id];
    await this.confirmAndDelete(ids);
  }

  private async confirmAndDelete(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const ok = await this.confirm.ask({
      title: ids.length === 1 ? 'Delete template?' : `Delete ${ids.length} templates?`,
      body: 'Removes them from this workspace library.',
      confirmLabel: 'Delete',
    });
    if (ok)
      await this.store.removeMany(ids);
  }

  private async confirmAndDeleteGroup(tag: string): Promise<void> {
    const count = this.store
      .allTemplates()
      .filter((item) => (item.tags[0] ?? '').toLowerCase() === tag.toLowerCase()).length;
    const ok = await this.confirm.ask({
      title: `Delete group ${tag}?`,
      body:
        count > 0
          ? `${count} template${count === 1 ? '' : 's'} will move to Untagged.`
          : 'This removes the empty group.',
      confirmLabel: 'Delete',
    });
    if (ok)
      await this.store.removeGroup(tag);
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
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (!this.store.panelOpen())
      return;

    if (this.menu()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMenu();
      }
      return;
    }

    if (this.store.renamingId() || this.store.renamingGroup()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.store.renamingId.set(null);
        this.store.renamingGroup.set(null);
      }
      return;
    }

    if (isEditableKeyboardTarget(event.target))
      return;
    if (shouldDeferToFlowCanvas(event))
      return;

    if (event.key === 'Escape') {
      if (this.store.selectedIds().length === 0)
        return;
      event.preventDefault();
      this.store.clearSelection();
      return;
    }

    if (event.key === 'Enter') {
      const id = this.store.selectedIds().find((item) => !parseFlowTemplateGroupNodeId(item));
      if (!id)
        return;
      event.preventDefault();
      this.store.openTemplate(id);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.store.selectedIds().filter((id) => !parseFlowTemplateGroupNodeId(id));
      if (ids.length === 0)
        return;
      event.preventDefault();
      void this.confirmAndDelete(ids);
      return;
    }

    if (isModKey(event, 'a')) {
      event.preventDefault();
      this.store.selectAllVisible();
      return;
    }

    if (isModKey(event, 'd')) {
      const ids = this.store.selectedIds().filter((id) => !parseFlowTemplateGroupNodeId(id));
      if (ids.length === 0)
        return;
      event.preventDefault();
      void (async () => {
        for (const id of ids)
          await this.store.duplicate(id);
      })();
      return;
    }

    if (!ownsTreeClipboardShortcut(this.host.nativeElement, event, false))
      return;

    if (isModKey(event, 'c') && !event.shiftKey) {
      const templates = this.store.copySelection();
      if (templates.length === 0)
        return;
      event.preventDefault();
      this.clipboard.set({ kind: 'flow-templates', templates });
      return;
    }

    if (isModKey(event, 'v') && !event.shiftKey) {
      const memory = this.clipboard.peek('flow-templates');
      if (memory) {
        event.preventDefault();
        void this.store.pasteCopied(memory.templates);
        return;
      }
      void this.clipboard.get('flow-templates').then((payload) => {
        if (payload)
          void this.store.pasteCopied(payload.templates);
      });
    }
  }

  private claimClipboardFocus(): void {
    const host = this.host.nativeElement;
    if (document.activeElement !== host)
      host.focus({ preventScroll: true });
  }

  private openMenu(event: MouseEvent, partial: TemplatesMenu): void {
    event.preventDefault();
    event.stopPropagation();
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
    const menu = overlayRef.overlayElement.querySelector('.tx-flow-tpl__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 188;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 180;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }
}

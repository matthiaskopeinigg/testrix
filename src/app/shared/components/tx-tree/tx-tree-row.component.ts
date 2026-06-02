import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInlineRenameInputComponent } from '@app/shared/components/tx-inline-rename-input/tx-inline-rename-input.component';
/** Max tag chips shown on a tree row meta line; additional tags collapse to +N. */
const TX_TREE_ROW_MAX_VISIBLE_TAGS = 6;

import type {
  TxTreeConfig,
  TxTreeDnDState,
  TxTreeDropPosition,
  TxTreeVisibleRow,
} from './tx-tree.types';
import {
  TX_TREE_DROP_HIT_AFTER_RATIO,
  TX_TREE_DROP_HIT_BEFORE_RATIO,
  TX_TREE_ROW_HIT_SLOP_PX,
} from './tx-tree.types';

@Component({
  selector: 'tx-tree-row',
  standalone: true,
  imports: [NgTemplateOutlet, TxIconComponent, TxInlineRenameInputComponent],
  templateUrl: './tx-tree-row.component.html',
  styleUrl: './tx-tree-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tree-row-host',
    role: 'treeitem',
    '[attr.aria-expanded]': 'row().hasChildren ? row().expanded : null',
    '[attr.aria-level]': 'row().depth + 1',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-disabled]': 'row().node.disabled || null',
    '[class.tx-tree-row-host--selected]': 'selected()',
    '[class.tx-tree-row-host--disabled]': 'row().node.disabled',
    '[class.tx-tree-row-host--dragging]': 'isDragging()',
    '[class.tx-tree-row-host--drop-before]': 'dropPosition() === "before"',
    '[class.tx-tree-row-host--drop-after]': 'dropPosition() === "after"',
    '[class.tx-tree-row-host--drop-inside]': 'dropPosition() === "inside"',
    '[class.tx-tree-row-host--drop-deny]': 'showDropDeny()',
    '[class.tx-tree-row-host--debug]': 'debug()',
    '[class.tx-tree-row-host--debug-target]': 'isDebugDragTarget()',
    '[class.tx-dnd-deny-active]': 'showDropRejectShake()',
    '[attr.data-tx-tree-node-id]': 'row().id',
    '[style.--tx-tree-indent]': 'indentPx() + "px"',
    '[style.--row-depth]': 'row().depth',
    '[class.tx-tree-row-host--expand-reveal]': 'expandRevealIndex() !== null',
    '[style.--tx-tree-expand-reveal-index]': 'expandRevealIndex() ?? 0',
    '[class.tx-tree-row-host--has-subtitle]': '!!row().node.subtitle',
    '[class.tx-tree-row-host--has-meta]': 'hasMetaRow()',
    '[class.tx-tree-row-host--renaming]': 'renaming()',
  },
})
export class TxTreeRowComponent<TMeta = unknown> implements AfterViewInit, OnDestroy {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly row = input.required<TxTreeVisibleRow<TMeta>>();
  readonly config = input.required<TxTreeConfig<TMeta>>();
  readonly debug = input(false);
  readonly selected = input(false);
  readonly dndState = input.required<TxTreeDnDState>();
  readonly indentPx = input(16);
  readonly expandRevealIndex = input<number | null>(null);
  readonly renaming = input(false);
  /** When set, replaces the default label/icon body while keeping row chrome and DnD. */
  readonly nodeBodyTemplate = input<TemplateRef<unknown> | null>(null);
  readonly nodeBodyContext = input<unknown>(null);

  readonly rowClick = output<void>();
  readonly rowDblClick = output<void>();
  readonly renameCommit = output<string>();
  readonly renameCancel = output<void>();
  readonly chevronClick = output<void>();
  readonly pointerDownRow = output<PointerEvent>();
  readonly pointerDownHandle = output<PointerEvent>();
  readonly registerElement = output<HTMLElement>();
  readonly unregisterElement = output<void>();
  readonly rowContextMenu = output<{ clientX: number; clientY: number }>();

  protected isDragging(): boolean {
    return this.dndState().draggingId === this.row().id;
  }

  /** Highlights source/target while dragging in debug mode. */
  protected isDebugDragTarget(): boolean {
    if (!this.debug()) {
      return false;
    }

    const state = this.dndState();
    if (!state.draggingId) {
      return false;
    }

    const id = this.row().id;
    return (
      id === state.draggingId ||
      id === state.dropTargetId ||
      id === state.denyTargetId
    );
  }

  protected dropPosition(): TxTreeDropPosition | null {
    const state = this.dndState();
    if (state.denyTargetId || state.draggingId === this.row().id) {
      return null;
    }

    if (state.indicatorTargetId !== null && state.indicatorPosition !== null) {
      if (state.indicatorTargetId !== this.row().id) {
        return null;
      }
      return state.indicatorPosition;
    }

    if (
      state.dropTargetId === this.row().id &&
      state.dropPosition === 'inside'
    ) {
      return 'inside';
    }

    return null;
  }

  protected insertLineDepth(): number {
    const state = this.dndState();
    if (
      state.indicatorTargetId === this.row().id &&
      state.indicatorIndentDepth !== null
    ) {
      return state.indicatorIndentDepth;
    }
    return this.row().depth;
  }

  /** Subtle invalid-target hint while hovering (no shake animation). */
  protected showDropDeny(): boolean {
    const state = this.dndState();
    return state.denyTargetId === this.row().id && !!state.draggingId;
  }

  /** Shake animation after a rejected drop (pointer up). */
  protected showDropRejectShake(): boolean {
    const state = this.dndState();
    const config = this.config();
    return (
      config.visual.animateDeny &&
      state.denyTargetId === this.row().id &&
      !state.draggingId
    );
  }

  protected readonly hitSlopPx = TX_TREE_ROW_HIT_SLOP_PX;
  protected readonly dropBeforePercent = Math.round(TX_TREE_DROP_HIT_BEFORE_RATIO * 100);
  protected readonly dropAfterPercent = Math.round(TX_TREE_DROP_HIT_AFTER_RATIO * 100);
  protected readonly dropInsidePercent =
    100 - this.dropBeforePercent - this.dropAfterPercent;

  protected rowIconSize(): number {
    return this.debug() ? 26 : 18;
  }

  protected chevronIconSize(): number {
    return this.debug() ? 24 : 16;
  }

  protected handleIconSize(): number {
    return this.debug() ? 24 : 16;
  }

  protected hasMetaRow(): boolean {
    return this.visibleTreeTags().length > 0 || this.treeTagsOverflowCount() > 0;
  }

  protected isFavourite(): boolean {
    return this.row().node.favourite === true;
  }

  protected isCritical(): boolean {
    return this.row().node.critical === true;
  }

  protected visibleTreeTags(): readonly string[] {
    const tags = this.row().node.tags;
    if (!tags?.length) {
      return [];
    }
    return tags.slice(0, TX_TREE_ROW_MAX_VISIBLE_TAGS);
  }

  protected treeTagsOverflowCount(): number {
    const tags = this.row().node.tags;
    if (!tags?.length) {
      return 0;
    }
    return Math.max(0, tags.length - TX_TREE_ROW_MAX_VISIBLE_TAGS);
  }

  protected showDragHandle(): boolean {
    const config = this.config();
    return config.visual.showDragHandle || config.drag.handleOnly;
  }

  protected handleRowClick(): void {
    if (this.row().node.disabled || this.renaming()) {
      return;
    }
    this.rowClick.emit();
  }

  protected handleRowDblClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.row().node.disabled || this.renaming()) {
      return;
    }
    this.rowDblClick.emit();
  }

  protected handleChevronClick(event: Event): void {
    event.stopPropagation();
    if (this.row().node.disabled || !this.row().hasChildren) {
      return;
    }
    this.chevronClick.emit();
  }

  protected handlePointerDownRow(event: PointerEvent): void {
    if (this.row().node.disabled) {
      return;
    }
    this.pointerDownRow.emit(event);
  }

  protected handlePointerDownHandle(event: PointerEvent): void {
    event.stopPropagation();
    if (this.row().node.disabled) {
      return;
    }
    this.pointerDownHandle.emit(event);
  }

  protected handleContextMenu(event: MouseEvent): void {
    if (this.row().node.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.rowContextMenu.emit({ clientX: event.clientX, clientY: event.clientY });
  }

  ngAfterViewInit(): void {
    this.registerElement.emit(this.hostEl.nativeElement);
  }

  ngOnDestroy(): void {
    this.unregisterElement.emit();
  }
}

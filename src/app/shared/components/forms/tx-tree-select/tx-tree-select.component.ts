import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { filter, fromEvent } from 'rxjs';

import { mergeTxTreeConfig } from '../../data/tx-tree/tx-tree.config';
import { TxTreeComponent } from '../../data/tx-tree/tx-tree.component';
import type { TxTreeNode, TxTreeNodeClickEvent } from '../../data/tx-tree/tx-tree.types';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import type { TxIconName } from '../../../icons/tx-icon.registry';

/**
 * Dropdown that picks a leaf from a `tx-tree` (folders expand, leaves select).
 */
@Component({
  selector: 'tx-tree-select',
  standalone: true,
  imports: [FormsModule, TxIconComponent, TxInputComponent, TxTreeComponent],
  templateUrl: './tx-tree-select.component.html',
  styleUrl: './tx-tree-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tree-select-host',
    '[class.tx-tree-select-host--open]': 'isOpen()',
    '[class.tx-tree-select-host--disabled]': 'isDisabled()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxTreeSelectComponent),
      multi: true,
    },
  ],
})
export class TxTreeSelectComponent implements ControlValueAccessor {
  private static nextId = 0;

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');
  private portaledPanel: HTMLElement | null = null;

  readonly nodes = input<readonly TxTreeNode[]>([]);
  readonly placeholder = input('Select…');
  readonly disabled = input(false);
  readonly emptyLabel = input('No items');
  readonly searchPlaceholder = input('Filter…');
  readonly ariaLabel = input('');

  readonly valueChange = output<string>();

  protected readonly autoId = `tx-tree-select-${TxTreeSelectComponent.nextId++}`;
  protected readonly isOpen = signal(false);
  protected readonly value = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly expandedIds = signal<readonly string[]>([]);
  protected readonly panelStyle = signal({ left: 0, top: 0, width: 0 });
  private readonly tree = viewChild(TxTreeComponent);

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  private formDisabled = false;

  constructor() {
    fromEvent<MouseEvent>(this.document, 'click', { capture: true })
      .pipe(
        filter(() => this.isOpen()),
        filter((event) => !this.isInsidePicker(event.target)),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closePanel());

    fromEvent(this.document, 'scroll', { capture: true })
      .pipe(
        filter(() => this.isOpen()),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.syncPanelPosition());

    fromEvent(window, 'resize')
      .pipe(
        filter(() => this.isOpen()),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.syncPanelPosition());

    effect(() => {
      if (!this.isOpen()) {
        this.removePortaledPanel();
        return;
      }
      queueMicrotask(() => {
        if (!this.isOpen()) {
          this.removePortaledPanel();
          return;
        }
        this.portalPanelToBody();
        this.syncPanelPosition();
      });
    });

    this.destroyRef.onDestroy(() => this.removePortaledPanel());
  }

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled);

  protected readonly filteredNodes = computed(() =>
    asPickerNodes(filterTreeNodes(this.nodes(), this.search())),
  );

  protected readonly selectedNode = computed(() => findTreeNode(this.nodes(), this.value()));

  protected readonly triggerLabel = computed(() => this.selectedNode()?.label ?? this.placeholder());

  protected readonly triggerIcon = computed((): TxIconName | null => {
    const icon = this.selectedNode()?.icon;
    return icon ?? null;
  });

  protected readonly hasSelection = computed(() => this.selectedNode() != null);

  protected readonly displayExpandedIds = computed(() => {
    if (this.search().trim()) {
      return collectExpandableIds(this.filteredNodes());
    }
    return this.expandedIds();
  });

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig({
      ariaLabel: this.ariaLabel() || 'Options',
      drag: { enabled: false },
      drop: { enabled: false },
      selection: {
        mode: 'single',
        canSelect: (ctx) => !isFolderNode(ctx.node),
      },
      visual: { indentPx: 12, animateExpand: false, animateMove: false },
    }),
  );

  protected readonly selectionIds = computed(() => {
    const id = this.value();
    return id ? [id] : [];
  });

  writeValue(value: string | null): void {
    this.value.set(value && value.trim() ? value : null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled = isDisabled;
  }

  protected handleTriggerClick(): void {
    if (this.isDisabled()) {
      return;
    }
    if (this.isOpen()) {
      this.closePanel();
      return;
    }
    this.syncPanelPosition();
    this.isOpen.set(true);
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds(ids);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    const node = event.node ?? findTreeNode(this.filteredNodes(), event.nodeId);
    if (!node) {
      return;
    }
    if (isFolderNode(node)) {
      this.toggleFolderExpanded(node.id);
      return;
    }
    this.value.set(node.id);
    this.onChange(node.id);
    this.valueChange.emit(node.id);
    this.closePanel();
  }

  private toggleFolderExpanded(id: string): void {
    const current = this.expandedIds();
    this.applyExpandedIds(
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  private applyExpandedIds(ids: readonly string[]): void {
    this.expandedIds.set(ids);
    this.tree()?.syncExpansionFromInput(ids);
  }

  private closePanel(): void {
    if (this.isOpen()) {
      this.isOpen.set(false);
      this.onTouched();
    }
  }

  /** True when the event target is the trigger host or the portaled panel. */
  private isInsidePicker(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    if (this.hostRef.nativeElement.contains(target)) {
      return true;
    }
    return this.panelRef()?.nativeElement.contains(target) ?? false;
  }

  /** Positions the panel under the trigger using viewport coordinates. */
  private syncPanelPosition(): void {
    const trigger = this.triggerRef()?.nativeElement;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    this.panelStyle.set({
      left: rect.left,
      top: rect.bottom + 6,
      width: rect.width,
    });
  }

  /** Escapes split/editor overflow so hover and clicks hit the panel, not the SQL textarea. */
  private portalPanelToBody(): void {
    const panel = this.panelRef()?.nativeElement;
    if (!panel) {
      return;
    }
    this.portaledPanel = panel;
    if (panel.parentElement === this.document.body) {
      return;
    }
    this.document.body.appendChild(panel);
  }

  /** Moves the panel back under the host so Angular can destroy the `@if` view. */
  private removePortaledPanel(): void {
    const panel = this.portaledPanel;
    this.portaledPanel = null;
    if (!panel?.isConnected) {
      return;
    }
    const host = this.hostRef.nativeElement;
    if (panel.parentElement === this.document.body) {
      host.appendChild(panel);
    }
  }
}

/** Folders stay expandable; leaves never show a chevron in the picker. */
function asPickerNodes(nodes: readonly TxTreeNode[]): TxTreeNode[] {
  return nodes.map((node) => {
    if (isFolderNode(node)) {
      return {
        ...node,
        children: node.children ? asPickerNodes(node.children) : node.children,
      };
    }
    return { ...node, expandable: false };
  });
}

function isFolderNode(node: TxTreeNode): boolean {
  if (node.kind === 'folder') {
    return true;
  }
  if (node.kind === 'connection') {
    return false;
  }
  return Array.isArray(node.children) && node.children.length > 0;
}

function findTreeNode(nodes: readonly TxTreeNode[], id: string | null): TxTreeNode | null {
  if (!id) {
    return null;
  }
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children?.length) {
      const found = findTreeNode(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function collectExpandableIds(nodes: readonly TxTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly TxTreeNode[]): void => {
    for (const node of list) {
      if (node.children?.length) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

function filterTreeNodes(nodes: readonly TxTreeNode[], query: string): TxTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...nodes];
  }
  const filterNodes = (list: readonly TxTreeNode[]): TxTreeNode[] => {
    const out: TxTreeNode[] = [];
    for (const node of list) {
      const labelMatch = node.label.toLowerCase().includes(q);
      const children = node.children ? filterNodes(node.children) : undefined;
      const childMatch = !!children?.length;
      if (labelMatch || childMatch) {
        out.push({ ...node, children: childMatch ? children : node.children });
      }
    }
    return out;
  };
  return filterNodes(nodes);
}

import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  forwardRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  selectionCheckState,
  toggleTreeSelection,
  type SelectionCheckState,
} from '@testrix/contracts';

import type { PackTreeNode } from './pack-selection-tree';
import { getPackDescendantIds } from './pack-selection-tree';

@Component({
  selector: 'tx-pack-selection-tree-node',
  standalone: true,
  imports: [forwardRef(() => PackSelectionTreeNodeComponent)],
  templateUrl: './pack-selection-tree-node.component.html',
  styleUrl: './pack-selection-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackSelectionTreeNodeComponent {
  readonly node = input.required<PackTreeNode>();
  readonly depth = input(0);
  readonly nodes = input.required<readonly PackTreeNode[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly expandedIds = input.required<ReadonlySet<string>>();

  readonly selectedIdsChange = output<ReadonlySet<string>>();
  readonly expandedIdsChange = output<ReadonlySet<string>>();

  private readonly checkbox = viewChild<ElementRef<HTMLInputElement>>('checkbox');

  constructor() {
    afterRenderEffect(() => {
      const el = this.checkbox()?.nativeElement;
      if (!el)
        return;
      const state = this.checkState();
      el.indeterminate = state === 'indeterminate';
      el.checked = state === 'checked';
    });
  }

  checkState(): SelectionCheckState {
    const node = this.node();
    const selected = this.selectedIds();
    const descendants = getPackDescendantIds(this.nodes(), node.id);
    return selectionCheckState(node.id, selected, () => descendants);
  }

  isExpanded(): boolean {
    return this.expandedIds().has(this.node().id);
  }

  toggleExpand(event: Event): void {
    event.stopPropagation();
    const id = this.node().id;
    const next = new Set(this.expandedIds());
    if (next.has(id))
      next.delete(id);
    else
      next.add(id);
    this.expandedIdsChange.emit(next);
  }

  toggleSelection(event: Event): void {
    event.stopPropagation();
    const node = this.node();
    const descendants = getPackDescendantIds(this.nodes(), node.id);
    const next = toggleTreeSelection(this.selectedIds(), node.id, descendants);
    this.selectedIdsChange.emit(next);
  }

  handleRowClick(): void {
    const node = this.node();
    if (node.kind !== 'folder')
      return;
    const next = new Set(this.expandedIds());
    if (next.has(node.id))
      next.delete(node.id);
    else
      next.add(node.id);
    this.expandedIdsChange.emit(next);
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    this.handleRowClick();
  }
}

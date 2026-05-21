import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type { TxTreeNode, TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';
import { testSuiteTabResourceId } from '@shared/testing';

import type { TestSuiteFlow, TestSuiteTreeItem } from '@shared/testing';

function isFlow(item: TestSuiteTreeItem): item is TestSuiteFlow {
  return 'nodes' in item;
}

function toTreeNodes(items: readonly TestSuiteTreeItem[]): TxTreeNode[] {
  return items.map((item) => {
    if (isFlow(item)) {
      return {
        id: item.id,
        label: item.name,
        subtitle: item.description || undefined,
        icon: 'play',
        kind: 'flow',
      };
    }
    return {
      id: item.id,
      label: item.name,
      icon: 'folder',
      kind: 'folder',
      children: toTreeNodes(item.children),
    };
  });
}

@Component({
  selector: 'app-test-suite-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxTreeComponent, TxIconComponent],
  templateUrl: './test-suite-sidebar-panel.component.html',
  styleUrl: './test-suite-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestSuiteSidebarPanelComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly testSuite = inject(TestSuiteService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search tests');

  protected readonly navFilter = signal('');
  protected readonly treeNodes = computed(() => {
    const q = this.navFilter().trim().toLowerCase();
    const items = this.testSuite.flows();
    if (!q) {
      return toTreeNodes(items);
    }
    const filterItems = (list: readonly TestSuiteTreeItem[]): TestSuiteTreeItem[] => {
      const out: TestSuiteTreeItem[] = [];
      for (const item of list) {
        if (isFlow(item)) {
          if (item.name.toLowerCase().includes(q)) {
            out.push(item);
          }
          continue;
        }
        const children = filterItems(item.children);
        if (item.name.toLowerCase().includes(q) || children.length > 0) {
          out.push({ ...item, children });
        }
      }
      return out;
    };
    return toTreeNodes(filterItems(items));
  });

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  constructor() {
    effect(() => {
      this.testSuite.flows();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected handleAddFlow(): void {
    const flow = this.testSuite.addFlow();
    if (flow) {
      this.openFlow(flow.id);
    }
    this.cdr.markForCheck();
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    const kind = event.node.kind === 'flow' ? 'flow' : 'folder';
    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId(kind, event.node.id),
      kind: 'test-suite',
    });
  }

  private openFlow(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: testSuiteTabResourceId('flow', id),
      kind: 'test-suite',
    });
  }
}

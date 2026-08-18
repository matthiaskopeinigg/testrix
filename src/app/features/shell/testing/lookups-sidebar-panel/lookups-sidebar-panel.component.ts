import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { LookupService } from '@app/core/testing/lookup.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxContextMenuComponent } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/overlays/tx-confirm-dialog/tx-confirm-dialog.component';
import { mergeTxTreeConfig } from '@app/shared/components/data/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/data/tx-tree/tx-tree.component';
import type {
  TxTreeNode,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/data/tx-tree/tx-tree.types';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';
import { buildEmptyLookupContextMenu, buildLookupNodeContextMenu } from './lookup-context-menu';

@Component({
  selector: 'app-lookups-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './lookups-sidebar-panel.component.html',
  styleUrl: './lookups-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookupsSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly lookups = inject(LookupService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Lookups';

  protected readonly searchQuery = signal('');
  protected readonly renamingNodeId = signal<string | null>(null);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig({
      ariaLabel: 'Lookups',
      drag: { enabled: false },
      drop: { enabled: false },
    }),
  );

  protected readonly nodes = computed((): readonly TxTreeNode[] => {
    const query = this.searchQuery().trim().toLowerCase();
    return this.lookups.lookups()
      .filter((lookup) => !query || lookup.name.toLowerCase().includes(query))
      .map((lookup) => ({
        id: lookup.id,
        label: lookup.name,
        icon: 'search' as const,
        kind: 'lookup',
        expandable: false,
        draggable: false,
        droppable: false,
      }));
  });

  protected readonly treeSelectionIds = computed(() =>
    testingSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly treeEmptyMessage = computed(() => {
    if (this.lookups.lookups().length === 0) {
      return 'No lookups yet. Right-click to add a playbook.';
    }
    if (this.searchQuery().trim()) {
      return 'No lookups match your search.';
    }
    return 'No lookups.';
  });

  constructor() {
    super();
    void this.lookups.hydrate({ force: true });
    effect(() => {
      this.lookups.lookups();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    this.cdr.markForCheck();
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent): void {
    this.openLookup(event.nodeId);
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent): void {
    this.openLookup(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const name = event.value.trim();
    if (name) {
      this.lookups.patchLookup(event.nodeId, { name });
    }
    this.renamingNodeId.set(null);
    this.cdr.markForCheck();
  }

  protected handleRenameCancel(): void {
    this.renamingNodeId.set(null);
  }

  protected handleTreeAreaContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.tx-tree-row-host, .tx-tree-row, .tx-tree__custom-row')) {
      return;
    }
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY, null);
  }

  protected handleRowContextMenu(event: TxTreeRowContextMenuEvent): void {
    this.openContextMenu(event.clientX, event.clientY, event.nodeId);
  }

  protected handleContextMenuSelect(actionId: string): void {
    const nodeId = this.contextNodeId();
    this.contextMenuOpen.set(false);
    switch (actionId) {
      case 'new-lookup':
        this.handleCreate();
        break;
      case 'open':
        if (nodeId) {
          this.openLookup(nodeId);
        }
        break;
      case 'rename':
        if (nodeId) {
          this.renamingNodeId.set(nodeId);
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteDialog(nodeId);
        }
        break;
      default:
        break;
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
    this.contextNodeId.set(null);
  }

  protected handleDeleteConfirmed(): void {
    const id = this.deleteNodeId();
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
    if (!id) {
      return;
    }
    this.workspaceEditor.closeTabsForResourceIds([this.lookups.tabResourceId(id)]);
    this.lookups.deleteLookup(id);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
    this.deleteNodeId.set(null);
  }

  private handleCreate(): void {
    const created = this.lookups.createLookup();
    this.openLookup(created.id);
    this.renamingNodeId.set(created.id);
  }

  private openLookup(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.lookups.tabResourceId(id),
      kind: 'lookup',
    });
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });
    this.contextMenuItems.set(nodeId ? buildLookupNodeContextMenu() : buildEmptyLookupContextMenu());
    this.contextMenuOpen.set(true);
  }

  private openDeleteDialog(nodeId: string): void {
    const lookup = this.lookups.find(nodeId);
    if (!lookup) {
      return;
    }
    this.deleteMessage.set(`Delete lookup “${lookup.name}”?`);
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }
}

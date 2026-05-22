import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type {
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeRowContextMenuEvent,
} from '@app/shared/components/tx-tree/tx-tree.types';
import { WorkspacePanelToolbarActionsDirective } from '@app/features/shell/workspace/workspace-panel-toolbar-actions.directive';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { environmentsSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import type {
  EnvironmentListSidebarFilter,
  EnvironmentListSidebarSortBy,
} from '@shared/config';
import {
  DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER,
  DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY,
} from '@shared/config';

import {
  buildEmptyEnvironmentListContextMenu,
  buildEnvironmentListRowContextMenu,
} from './environment-context-menu';
import {
  buildEnvironmentListFilterMenuItems,
  buildEnvironmentListSortMenuItems,
} from './environment-list-sidebar-menus';
import { environmentListItemsToTreeNodes } from './environment-list-tree.adapter';
import type { EnvironmentListTreeNodeMeta } from './environment-list-tree.types';
import { applyEnvironmentListView } from './environment-list.view';
import { getEnvironmentDefinition } from './environment-profile.utils';

const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-environments-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
    TxIconComponent,
    TxTreeComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './environments-sidebar-panel.component.html',
  styleUrl: './environments-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsSidebarPanelComponent {
  private readonly configService = inject(ConfigService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  readonly searchPlaceholder = input('Search environments…');
  readonly searchAriaLabel = input('Search environments');

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly listSidebarFilter = signal<EnvironmentListSidebarFilter>(
    DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER,
  );
  protected readonly listSidebarSortBy = signal<EnvironmentListSidebarSortBy>(
    DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY,
  );

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextProfileId = signal<string | null>(null);

  protected readonly renamingProfileId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteProfileId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  protected readonly filterMenuItems = computed(() =>
    buildEnvironmentListFilterMenuItems(this.listSidebarFilter()),
  );

  protected readonly sortMenuItems = computed(() =>
    buildEnvironmentListSortMenuItems(this.listSidebarSortBy()),
  );

  protected readonly filterToolbarActive = computed(
    () => this.listSidebarFilter() !== DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER,
  );

  protected readonly sortToolbarActive = computed(
    () => this.listSidebarSortBy() !== DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY,
  );

  protected readonly filteredProfiles = computed(() =>
    applyEnvironmentListView(this.environmentsService.environments(), {
      query: this.searchQueryDebounced(),
      filter: this.listSidebarFilter(),
      sortBy: this.listSidebarSortBy(),
    }),
  );

  protected readonly treeNodes = computed(() =>
    environmentListItemsToTreeNodes(
      this.filteredProfiles(),
      this.environmentsService.environments(),
    ),
  );

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<EnvironmentListTreeNodeMeta>({
      ariaLabel: 'Environments',
      expansion: { expandOnClick: false },
      visual: { showDragHandle: false },
      drag: { enabled: false },
    }),
  );

  protected readonly treeSelectionIds = computed(() =>
    environmentsSidebarSelectionIds(this.workspaceEditor.activeTab()),
  );

  protected readonly emptyStateMessage = computed(() => {
    const query = this.searchQuery().trim();
    if (query) {
      return 'No environments match your search.';
    }
    if (this.listSidebarFilter() === 'empty') {
      return 'No empty environments to show.';
    }
    if (this.listSidebarFilter() === 'with-variables') {
      return 'No environments with variables to show.';
    }
    return 'No environments yet. Right-click to create one.';
  });

  constructor() {
    effect(() => {
      void this.configService.sessionRevision();
      const session = untracked(() => this.configService.session());
      if (!session) {
        return;
      }
      const envSession = session.workspace.environments;
      this.listSidebarFilter.set(
        envSession.listSidebarFilter ?? DEFAULT_ENVIRONMENT_LIST_SIDEBAR_FILTER,
      );
      this.listSidebarSortBy.set(
        envSession.listSidebarSortBy ?? DEFAULT_ENVIRONMENT_LIST_SIDEBAR_SORT_BY,
      );
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQueryDebounced.set(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    this.sortMenuOpen.set(false);
    this.openToolbarMenu(event, this.filterMenuPosition, this.filterMenuOpen);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    this.filterMenuOpen.set(false);
    this.openToolbarMenu(event, this.sortMenuPosition, this.sortMenuOpen);
  }

  protected handleFilterMenuSelect(actionId: string): void {
    this.filterMenuOpen.set(false);
    const next = actionId as EnvironmentListSidebarFilter;
    if (next === this.listSidebarFilter()) {
      return;
    }
    this.listSidebarFilter.set(next);
    this.persistListSidebarViewPrefs();
  }

  protected handleSortMenuSelect(actionId: string): void {
    this.sortMenuOpen.set(false);
    const next = actionId as EnvironmentListSidebarSortBy;
    if (next === this.listSidebarSortBy()) {
      return;
    }
    this.listSidebarSortBy.set(next);
    this.persistListSidebarViewPrefs();
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<EnvironmentListTreeNodeMeta>): void {
    if (this.renamingProfileId()) {
      return;
    }
    this.workspaceEditor.openResource({ resourceId: event.nodeId, kind: 'environment' });
  }

  protected handleNodeDblClick(event: TxTreeNodeClickEvent<EnvironmentListTreeNodeMeta>): void {
    this.startInlineRename(event.nodeId);
  }

  protected handleRenameCommit(event: TxTreeNodeRenameCommitEvent): void {
    const trimmed = event.value.trim();
    if (trimmed) {
      this.environmentsService.updateEnvironment(event.nodeId, { name: trimmed });
    }
    this.renamingProfileId.set(null);
  }

  protected handleRenameCancel(): void {
    this.renamingProfileId.set(null);
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
    const profileId = this.contextProfileId();
    this.contextMenuOpen.set(false);

    switch (actionId) {
      case 'new-environment': {
        const createdId = this.environmentsService.createEnvironment();
        if (createdId) {
          this.workspaceEditor.openResource({ resourceId: createdId, kind: 'environment' });
        }
        break;
      }
      case 'rename':
        if (profileId) {
          this.startInlineRename(profileId);
        }
        break;
      case 'clone':
        if (profileId) {
          const clonedId = this.environmentsService.cloneEnvironment(profileId);
          if (clonedId) {
            this.workspaceEditor.openResource({ resourceId: clonedId, kind: 'environment' });
          }
        }
        break;
      case 'delete':
        if (profileId) {
          this.openDeleteDialog(profileId);
        }
        break;
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const id = this.deleteProfileId();
    if (!id) {
      return;
    }
    if (this.environmentsService.deleteNode(id)) {
      this.workspaceEditor.closeTabsForResourceIds([id]);
    }
    this.deleteOpen.set(false);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  private openContextMenu(x: number, y: number, profileId: string | null): void {
    this.contextProfileId.set(profileId);
    if (profileId === null) {
      this.contextMenuItems.set(buildEmptyEnvironmentListContextMenu());
    } else {
      this.contextMenuItems.set(buildEnvironmentListRowContextMenu());
    }
    this.contextMenuPosition.set({ x, y });
    this.contextMenuOpen.set(true);
  }

  private startInlineRename(profileId: string): void {
    if (!getEnvironmentDefinition(this.environmentsService.environments(), profileId)) {
      return;
    }
    this.renamingProfileId.set(profileId);
  }

  private openDeleteDialog(profileId: string): void {
    const environment = getEnvironmentDefinition(this.environmentsService.environments(), profileId);
    if (!environment) {
      return;
    }
    this.deleteMessage.set(
      `Delete environment "${environment.name}" and all variables inside? This cannot be undone.`,
    );
    this.deleteProfileId.set(profileId);
    this.deleteOpen.set(true);
  }

  private persistListSidebarViewPrefs(): void {
    void this.configService.patchSession({
      workspace: {
        environments: {
          listSidebarFilter: this.listSidebarFilter(),
          listSidebarSortBy: this.listSidebarSortBy(),
        },
      },
    });
  }

  private openToolbarMenu(
    event: MouseEvent,
    positionSignal: { set(value: { x: number; y: number }): void },
    openSignal: { set(value: boolean): void },
  ): void {
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    if (rect) {
      positionSignal.set({ x: rect.left, y: rect.bottom + 4 });
    } else {
      positionSignal.set({ x: event.clientX, y: event.clientY });
    }
    openSignal.set(true);
  }
}

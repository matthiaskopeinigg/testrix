import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInlineRenameInputComponent } from '@app/shared/components/tx-inline-rename-input/tx-inline-rename-input.component';
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
import { applyEnvironmentListView } from './environment-list.view';
import { getEnvironmentDefinition } from './environment-profile.utils';

const ROW_CLICK_DELAY_MS = 250;
const SEARCH_DEBOUNCE_MS = 100;
const LARGE_LIST_STAGGER_THRESHOLD = 40;

@Component({
  selector: 'app-environments-sidebar-panel',
  standalone: true,
  imports: [
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
    TxIconComponent,
    TxInlineRenameInputComponent,
    TxContextMenuComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './environments-sidebar-panel.component.html',
  styleUrl: './environments-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsSidebarPanelComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly configService = inject(ConfigService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly uiPreferences = inject(UiPreferencesService);
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

  private rowClickTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

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

  protected readonly activeEnvironmentId = computed(
    () => environmentsSidebarSelectionIds(this.workspaceEditor.activeTab())[0] ?? null,
  );

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

    afterNextRender(() => {
      const count = this.filteredProfiles().length;
      if (count > LARGE_LIST_STAGGER_THRESHOLD) {
        this.entranceStaggerPlay.set(false);
        this.entranceStaggerSettled.set(true);
        return;
      }
      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () => {
          const profileCount = this.filteredProfiles().length;
          return profileCount > 0 ? profileCount : 1;
        },
      });
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

  protected isProfileActive(profileId: string): boolean {
    return this.activeEnvironmentId() === profileId;
  }

  protected handleRowClick(profileId: string): void {
    if (this.renamingProfileId()) {
      return;
    }

    if (this.rowClickTimer !== null) {
      clearTimeout(this.rowClickTimer);
    }

    this.rowClickTimer = setTimeout(() => {
      this.rowClickTimer = null;
      this.workspaceEditor.openResource({ resourceId: profileId, kind: 'environment' });
    }, ROW_CLICK_DELAY_MS);
  }

  protected handleRowDblClick(event: MouseEvent, profileId: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.rowClickTimer !== null) {
      clearTimeout(this.rowClickTimer);
      this.rowClickTimer = null;
    }

    this.startInlineRename(profileId);
  }

  protected handleInlineRenameCommit(profileId: string, name: string): void {
    this.environmentsService.updateEnvironment(profileId, { name });
    this.renamingProfileId.set(null);
  }

  protected handleInlineRenameCancel(): void {
    this.renamingProfileId.set(null);
  }

  protected handleListAreaContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.environments-sidebar-panel__row')) {
      return;
    }
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY, null);
  }

  protected handleRowContextMenu(event: MouseEvent, profileId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.openContextMenu(event.clientX, event.clientY, profileId);
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

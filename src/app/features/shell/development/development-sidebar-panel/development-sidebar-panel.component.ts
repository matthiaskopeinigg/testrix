import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { DEVELOPMENT_TOOLS } from '@app/core/development-tools/development-tool.registry';
import type { DevelopmentToolDefinition } from '@app/core/development-tools/development-tool.types';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { DevelopmentToolId } from '@shared/config';

@Component({
  selector: 'app-development-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxIconComponent],
  templateUrl: './development-sidebar-panel.component.html',
  styleUrl: './development-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopmentSidebarPanelComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search development tools');

  protected readonly navFilter = signal('');
  protected readonly activeToolId = signal<DevelopmentToolId | null>(null);

  protected readonly filteredTools = computed((): readonly DevelopmentToolDefinition[] => {
    const query = this.navFilter().trim().toLowerCase();
    if (!query) {
      return DEVELOPMENT_TOOLS;
    }

    return DEVELOPMENT_TOOLS.filter(
      (tool) =>
        tool.label.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query),
    );
  });

  constructor() {
    effect(() => {
      const tab = this.workspaceEditor.activeTab();
      if (tab?.kind !== 'dev-tool') {
        return;
      }
      this.activeToolId.set(tab.resourceId as DevelopmentToolId);
      this.cdr.markForCheck();
    });

    afterNextRender(() => {
      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () => {
          const count = this.filteredTools().length;
          return count > 0 ? count : 1;
        },
      });
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected handleToolSelect(toolId: DevelopmentToolId): void {
    this.activeToolId.set(toolId);
    this.workspaceEditor.openResource({ resourceId: toolId, kind: 'dev-tool' });
    this.cdr.markForCheck();
  }
}

import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';

import { DESIGN_SYSTEM_NAV, findDesignSystemSection } from '@app/core/design-system/design-system.registry';
import { DesignSystemSessionService } from '@app/core/design-system/design-system-session.service';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import type { DesignSystemNavGroup, DesignSystemPillar } from '@app/core/design-system/design-system.types';
import { ElectronService } from '@app/core/electron/electron.service';
import { UpdateService } from '@app/core/updater/update.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { DS_PILLAR_ICONS } from '@app/features/dev/pages/design-system/design-system-page.constants';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { createDefaultWorkspaceDesignSystem } from '@shared/config';

@Component({
  selector: 'app-design-system-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxIconComponent],
  templateUrl: './design-system-sidebar-panel.component.html',
  styleUrl: './design-system-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignSystemSidebarPanelComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly designSystemSession = inject(DesignSystemSessionService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly electron = inject(ElectronService);
  private readonly updates = inject(UpdateService);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

  readonly searchPlaceholder = 'Search…';
  readonly searchAriaLabel = 'Filter design system sections';

  readonly navGroups = DESIGN_SYSTEM_NAV;

  protected readonly navFilter = signal('');
  protected readonly expandedPillars = signal<readonly DesignSystemPillar[]>(
    createDefaultWorkspaceDesignSystem().expandedPillars,
  );
  protected readonly activeSectionId = signal<string | null>(null);

  protected readonly showDevToolkit = computed(
    () => typeof ngDevMode !== 'undefined' && ngDevMode && this.electron.isDevToolkit(),
  );

  protected readonly filteredNavGroups = computed((): readonly DesignSystemNavGroup[] => {
    const query = this.navFilter().trim().toLowerCase();
    if (!query) {
      return this.navGroups;
    }

    return this.navGroups
      .map((group) => {
        const pillarMatches = group.label.toLowerCase().includes(query);
        const sections = group.sections.filter(
          (section) =>
            pillarMatches ||
            section.label.toLowerCase().includes(query) ||
            section.description.toLowerCase().includes(query),
        );

        if (sections.length === 0 && !pillarMatches) {
          return null;
        }

        return {
          ...group,
          sections: pillarMatches ? group.sections : sections,
        };
      })
      .filter((group): group is DesignSystemNavGroup => group !== null);
  });

  constructor() {
    effect(() => {
      const tab = this.workspaceEditor.activeTab();
      if (tab?.kind !== 'design-system') {
        return;
      }
      this.activeSectionId.set(tab.resourceId);
      const located = findDesignSystemSection(tab.resourceId);
      if (located) {
        const expanded = this.expandedPillars();
        if (!expanded.includes(located.group.pillar)) {
          this.expandedPillars.set([...expanded, located.group.pillar]);
        }
      }
      this.cdr.markForCheck();
    });

    afterNextRender(() => {
      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () => {
          const count = this.filteredNavGroups().length;
          return count > 0 ? count : 1;
        },
      });
    });
  }

  ngOnInit(): void {
    this.designSystemSession.load();
    const saved = this.designSystemSession.get();
    if (saved) {
      this.expandedPillars.set([...saved.expandedPillars]);
      this.activeSectionId.set(saved.activeSectionId);
    }
    this.cdr.markForCheck();
  }

  protected pillarIcon(pillar: DesignSystemPillar): TxIconName {
    return DS_PILLAR_ICONS[pillar];
  }

  protected isCategoryExpanded(pillar: DesignSystemPillar): boolean {
    return this.expandedPillars().includes(pillar);
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected toggleCategoryExpanded(pillar: DesignSystemPillar, event: Event): void {
    event.stopPropagation();
    const next = this.isCategoryExpanded(pillar)
      ? this.expandedPillars().filter((p) => p !== pillar)
      : [...this.expandedPillars(), pillar];
    this.expandedPillars.set(next);
    this.persistExpandedPillars(next);
    this.cdr.markForCheck();
  }

  protected handleSectionSelect(sectionId: string): void {
    const located = findDesignSystemSection(sectionId);
    if (!located) {
      return;
    }

    const expanded = this.expandedPillars();
    if (!expanded.includes(located.group.pillar)) {
      this.expandedPillars.set([...expanded, located.group.pillar]);
    }

    this.activeSectionId.set(sectionId);
    this.designSystemSession.patch({
      activePillar: located.group.pillar,
      activeSectionId: sectionId,
      expandedPillars: [...this.expandedPillars()],
    });

    this.workspaceEditor.openResource({ resourceId: sectionId, kind: 'design-system' });
    this.cdr.markForCheck();
  }

  protected simulateUpdateAvailable(): void {
    void this.updates.simulateUpdateAvailable();
  }

  protected simulateUpdateDownloading(): void {
    void this.updates.simulateUpdateDownloading();
  }

  protected simulateUpdateInstalling(): void {
    void this.updates.simulateUpdateInstalling();
  }

  private persistExpandedPillars(pillars: readonly DesignSystemPillar[]): void {
    const current = this.designSystemSession.get();
    const defaults = this.designSystemSession.getDefault();
    this.designSystemSession.patch({
      activePillar: current?.activePillar ?? defaults.activePillar,
      activeSectionId: current?.activeSectionId ?? defaults.activeSectionId,
      expandedPillars: [...pillars],
      debugEnabled: current?.debugEnabled ?? defaults.debugEnabled,
    });
  }
}

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  DESIGN_SYSTEM_NAV,
  findComponentEntry,
  parseComponentSectionId,
} from '@app/core/design-system/design-system.registry';
import {
  DesignSystemSessionService,
  sectionIdForPillar,
} from '@app/core/design-system/design-system-session.service';
import type {
  DesignSystemNavGroup,
  DesignSystemNavSection,
  DesignSystemPillar,
} from '@app/core/design-system/design-system.types';
import { ElectronService } from '@app/core/electron/electron.service';
import { UpdateService } from '@app/core/updater/update.service';
import { replayEntranceStagger } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import {
  WORKSPACE_SIDEBAR_MAIN_ITEMS,
  workspaceSidebarFooterItems,
} from '@app/features/shell/workspace/workspace-sidebar.constants';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxHelpPopupComponent } from '@app/shared/components/tx-help-popup/tx-help-popup.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxSidebarComponent } from '@app/shared/components/tx-sidebar/tx-sidebar.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { createDefaultWorkspaceDesignSystem } from '@shared/config';

import { DS_PILLAR_ICONS } from './design-system-page.constants';
import { DsBrandPanelComponent } from './panels/ds-brand-panel.component';
import { DsComponentsPanelComponent } from './panels/ds-components-panel.component';
import { DsPatternsPanelComponent } from './panels/ds-patterns-panel.component';
import { DsStyleGuidePanelComponent } from './panels/ds-style-guide-panel.component';
import { DsUiKitPanelComponent } from './panels/ds-ui-kit-panel.component';

@Component({
  selector: 'app-design-system-page',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxHelpPopupComponent,
    TxIconComponent,
    TxInputComponent,
    TxSidebarComponent,
    TxTagComponent,
    DsStyleGuidePanelComponent,
    DsBrandPanelComponent,
    DsComponentsPanelComponent,
    DsPatternsPanelComponent,
    DsUiKitPanelComponent,
  ],
  templateUrl: './design-system-page.component.html',
  styleUrl: './design-system-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignSystemPageComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly designSystemSession = inject(DesignSystemSessionService);
  private readonly electron = inject(ElectronService);
  private readonly router = inject(Router);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly updates = inject(UpdateService);

  readonly navGroups = DESIGN_SYSTEM_NAV;

  readonly sidebarMainItems = WORKSPACE_SIDEBAR_MAIN_ITEMS;

  protected readonly sidebarFooterItems = computed(() =>
    workspaceSidebarFooterItems(this.showDevToolkit() ?? false),
  );

  protected readonly activeSidebarId = signal<string | undefined>('debug');
  protected readonly sidebarPanelOpen = signal(false);
  protected readonly closeSidebarPanelOnOutsideClick =
    this.uiPreferences.closeSidebarPanelOnOutsideClick;

  readonly expandedPillars = signal<readonly DesignSystemPillar[]>(
    createDefaultWorkspaceDesignSystem().expandedPillars,
  );

  readonly activePillar = signal<DesignSystemPillar>('style-guide');
  readonly activeSectionId = signal('sg-typography');
  readonly debugEnabled = signal(false);
  protected readonly navFilter = signal('');
  protected readonly contentStaggerPlay = signal(false);
  protected readonly wikiOpen = signal(false);

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

  protected readonly activeGroup = computed(() =>
    this.navGroups.find((g) => g.pillar === this.activePillar()),
  );

  protected readonly activeSectionTabs = computed(() => {
    const query = this.navFilter().trim().toLowerCase();
    const group = this.activeGroup();
    if (!group) {
      return [];
    }
    if (!query) {
      return group.sections;
    }
    const pillarMatches = group.label.toLowerCase().includes(query);
    return group.sections.filter(
      (section) =>
        pillarMatches ||
        section.label.toLowerCase().includes(query) ||
        section.description.toLowerCase().includes(query),
    );
  });

  protected readonly activeSection = computed((): DesignSystemNavSection | undefined =>
    this.activeGroup()?.sections.find((s) => s.id === this.activeSectionId()),
  );

  protected readonly activeSectionLabel = computed(
    () => this.activeSection()?.label ?? this.activeSectionId(),
  );

  protected readonly activeSectionDescription = computed(
    () => this.activeSection()?.description ?? '',
  );

  protected readonly activePillarLabel = computed(() => this.activeGroup()?.label ?? '');

  protected readonly sectionIndexLabel = computed(() => {
    const tabs = this.activeSectionTabs();
    if (tabs.length === 0) {
      return '';
    }
    const index = tabs.findIndex((s) => s.id === this.activeSectionId());
    if (index < 0) {
      return '';
    }
    return `${index + 1} / ${tabs.length}`;
  });

  constructor() {
    afterNextRender(() => {
      replayEntranceStagger(
        this.contentStaggerPlay,
        () => this.uiPreferences.entranceStaggerEnabled(),
      );
    });
  }

  ngOnInit(): void {
    this.designSystemSession.load();
    this.applyViewState(this.designSystemSession.get() ?? this.designSystemSession.getDefault());
    this.cdr.markForCheck();
  }

  protected pillarIcon(pillar: DesignSystemPillar): TxIconName {
    return DS_PILLAR_ICONS[pillar];
  }

  protected isCategoryExpanded(pillar: DesignSystemPillar): boolean {
    return this.expandedPillars().includes(pillar);
  }

  protected sectionSupportsDebug(): boolean {
    const compId = parseComponentSectionId(this.activeSectionId());
    if (!compId) {
      return this.activePillar() === 'patterns' || this.activePillar() === 'ui-kit';
    }
    return findComponentEntry(compId)?.supportsDebug ?? false;
  }

  protected handleSidebarSelect(id: string): void {
    if (id === 'help') {
      this.wikiOpen.set(true);
      return;
    }

    if (id === 'debug') {
      return;
    }

    void this.router.navigateByUrl('/home');
  }

  protected handleCloseWiki(): void {
    this.wikiOpen.set(false);
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

  protected handleNavFilterChange(value: string): void {
    this.navFilter.set(value);
    this.ensureActiveSectionVisible();
    this.cdr.markForCheck();
  }

  protected toggleCategoryExpanded(pillar: DesignSystemPillar, event?: Event): void {
    event?.stopPropagation();
    const next = this.isCategoryExpanded(pillar)
      ? this.expandedPillars().filter((p) => p !== pillar)
      : [...this.expandedPillars(), pillar];
    this.expandedPillars.set(next);
    this.persistNav();
    this.cdr.markForCheck();
  }

  protected selectCategory(pillar: DesignSystemPillar): void {
    const expanded = this.expandedPillars();
    const nextExpanded = expanded.includes(pillar) ? expanded : [...expanded, pillar];
    if (!expanded.includes(pillar)) {
      this.expandedPillars.set(nextExpanded);
    }

    const sectionId = sectionIdForPillar(pillar);
    if (this.activePillar() === pillar && this.activeSectionId() === sectionId) {
      return;
    }

    this.activePillar.set(pillar);
    this.activeSectionId.set(sectionId);
    this.persistNav();
    this.replayContentStagger();
    this.cdr.markForCheck();
  }

  protected selectSection(sectionId: string): void {
    const group = this.navGroups.find((g) => g.sections.some((s) => s.id === sectionId));
    if (!group) {
      return;
    }

    const expanded = this.expandedPillars();
    if (!expanded.includes(group.pillar)) {
      this.expandedPillars.set([...expanded, group.pillar]);
    }

    if (this.activePillar() === group.pillar && this.activeSectionId() === sectionId) {
      return;
    }

    this.activePillar.set(group.pillar);
    this.activeSectionId.set(sectionId);
    this.persistNav();
    this.replayContentStagger();
    this.cdr.markForCheck();
  }

  protected toggleDebug(): void {
    this.debugEnabled.update((v) => !v);
    this.persistNav();
    this.cdr.markForCheck();
  }

  private applyViewState(state: {
    activePillar: DesignSystemPillar;
    activeSectionId: string;
    expandedPillars: readonly DesignSystemPillar[];
    debugEnabled: boolean;
  }): void {
    this.activePillar.set(state.activePillar);
    this.activeSectionId.set(state.activeSectionId);
    this.expandedPillars.set([...state.expandedPillars]);
    this.debugEnabled.set(state.debugEnabled);
    this.ensureActiveSectionVisible();
  }

  private ensureActiveSectionVisible(): void {
    const tabs = this.activeSectionTabs();
    if (tabs.length === 0) {
      return;
    }
    if (tabs.some((s) => s.id === this.activeSectionId())) {
      return;
    }
    const fallback = tabs[0]?.id;
    if (fallback) {
      this.activeSectionId.set(fallback);
      this.persistNav();
    }
  }

  private replayContentStagger(): void {
    replayEntranceStagger(
      this.contentStaggerPlay,
      () => this.uiPreferences.entranceStaggerEnabled(),
    );
  }

  private persistNav(): void {
    this.designSystemSession.patch({
      activePillar: this.activePillar(),
      activeSectionId: this.activeSectionId(),
      expandedPillars: [...this.expandedPillars()],
      debugEnabled: this.debugEnabled(),
    });
  }
}

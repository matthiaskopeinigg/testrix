import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

import type { TestingActiveViewId, TestingSubpanelId } from '@shared/config';

import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxSpinnerComponent } from '@app/shared/components/tx-spinner/tx-spinner.component';
import type { TxIconName } from '@app/shared/icons';

import {
  loadTestingSidebarPanel,
  peekTestingSidebarPanel,
  prefetchTestingSidebarPanels,
  type TestingSidebarPanelComponent as TestingProgrammaticPanelComponent,
} from '@app/features/shell/pages/home/resolve-testing-sidebar-panel';
import { LoadTestSidebarPanelComponent } from '../load-test-sidebar-panel/load-test-sidebar-panel.component';
import { TestSuiteSidebarPanelComponent } from '../test-suite-sidebar-panel/test-suite-sidebar-panel.component';

interface TestingHubItem {
  readonly id: string;
  readonly icon: TxIconName;
  readonly title: string;
  readonly hint: string;
  readonly drillIn?: TestingActiveViewId;
  readonly subpanel?: TestingSubpanelId;
}

const VIEW_TITLES: Record<TestingActiveViewId, string> = {
  menu: 'Testing',
  'test-suite': 'Test Suite',
  'load-test': 'Load Test',
};

@Component({
  selector: 'app-testing-sidebar-panel',
  standalone: true,
  imports: [
    NgComponentOutlet,
    TxIconComponent,
    TxSpinnerComponent,
    TestSuiteSidebarPanelComponent,
    LoadTestSidebarPanelComponent,
  ],
  templateUrl: './testing-sidebar-panel.component.html',
  styleUrl: './testing-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestingSidebarPanelComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly testingSession = inject(TestingSessionService);
  private readonly panelHeader = inject(WorkspaceSidebarPanelHeaderService);
  private readonly uiPreferences = inject(UiPreferencesService);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search testing');

  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

  protected readonly activeView = this.testingSession.activeView;
  protected readonly subpanel = this.testingSession.subpanel;

  private readonly programmaticPanels = signal<
    Partial<Record<TestingSubpanelId, TestingProgrammaticPanelComponent>>
  >({});

  protected readonly programmaticPanel = computed(() => {
    const subpanel = this.subpanel();
    if (subpanel === 'menu') {
      return null;
    }
    return this.programmaticPanels()[subpanel] ?? peekTestingSidebarPanel(subpanel);
  });

  protected readonly panelInputs = computed(() => ({
    searchPlaceholder: this.searchPlaceholder(),
    searchAriaLabel: this.searchAriaLabel(),
  }));

  protected readonly menuItems: readonly TestingHubItem[] = [
    {
      id: 'regression',
      icon: 'target',
      title: 'Regression',
      hint: 'Saved regressions and run history',
      subpanel: 'regression',
    },
    {
      id: 'test-suite',
      icon: 'testing',
      title: 'Test Suite',
      hint: 'Folders, flows and nodes',
      drillIn: 'test-suite',
    },
    {
      id: 'load-test',
      icon: 'zap',
      title: 'Load Test',
      hint: 'Performance, run history, and compare',
      drillIn: 'load-test',
    },
    {
      id: 'mock-server',
      icon: 'api',
      title: 'Mock Server',
      hint: 'Stubs, proxies and hits',
      subpanel: 'mock-server',
    },
    {
      id: 'capture',
      icon: 'globe',
      title: 'Capture',
      hint: 'Embedded browser and traffic log',
      subpanel: 'capture',
    },
    {
      id: 'interceptor',
      icon: 'interceptor',
      title: 'Interceptor',
      hint: 'Define HTTP intercept rules',
      subpanel: 'interceptor',
    },
  ];

  constructor() {
    this.testingSession.load();
    prefetchTestingSidebarPanels();

    effect(() => {
      const view = this.activeView();
      const subpanel = this.subpanel();
      if (subpanel !== 'menu') {
        return;
      }
      if (view === 'menu') {
        this.panelHeader.set({ title: VIEW_TITLES.menu });
        return;
      }
      this.panelHeader.set({
        title: VIEW_TITLES[view],
        onBack: () => this.handleBackToMenu(),
      });
    });

    effect(() => {
      const subpanel = this.subpanel();
      if (subpanel === 'menu') {
        return;
      }
      const cached = peekTestingSidebarPanel(subpanel);
      if (cached) {
        untracked(() =>
          this.programmaticPanels.update((current) =>
            current[subpanel] === cached ? current : { ...current, [subpanel]: cached },
          ),
        );
        return;
      }
      void loadTestingSidebarPanel(subpanel).then((cmp) => {
        this.programmaticPanels.update((current) => ({ ...current, [subpanel]: cmp }));
        this.cdr.markForCheck();
      });
    });

    afterNextRender(() => {
      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () => this.menuItems.length,
      });
    });
  }

  ngOnDestroy(): void {
    this.panelHeader.clear();
  }

  protected handleMenuClick(item: TestingHubItem): void {
    if (item.subpanel) {
      void loadTestingSidebarPanel(item.subpanel);
    }
    if (item.drillIn) {
      this.testingSession.setActiveView(item.drillIn);
      this.cdr.markForCheck();
      return;
    }
    if (item.subpanel) {
      this.testingSession.setSubpanel(item.subpanel);
      this.cdr.markForCheck();
    }
  }

  protected handleBackToMenu(): void {
    this.testingSession.backToTestingMenu();
    this.cdr.markForCheck();
  }
}

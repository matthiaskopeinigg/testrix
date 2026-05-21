import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type { TestingActiveViewId, TestingSubpanelId } from '@shared/config';

import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';
import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons';

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
  imports: [TxIconComponent, TestSuiteSidebarPanelComponent, LoadTestSidebarPanelComponent],
  templateUrl: './testing-sidebar-panel.component.html',
  styleUrl: './testing-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestingSidebarPanelComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly testingSession = inject(TestingSessionService);
  private readonly panelHeader = inject(WorkspaceSidebarPanelHeaderService);
  private readonly uiPreferences = inject(UiPreferencesService);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search testing');

  protected readonly sessionHydrated = signal(false);
  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);

  protected readonly activeView = computed(() => this.testingSession.activeView());

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
      hint: 'Performance and scalability',
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
    effect(() => {
      const view = this.activeView();
      if (view === 'menu') {
        this.panelHeader.set({ title: VIEW_TITLES.menu });
        return;
      }
      this.panelHeader.set({
        title: VIEW_TITLES[view],
        onBack: () => this.handleBackToMenu(),
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

  ngOnInit(): void {
    this.testingSession.load();
    this.sessionHydrated.set(true);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.panelHeader.clear();
  }

  protected handleMenuClick(item: TestingHubItem): void {
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

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, effect, inject, input } from '@angular/core';

import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceSidebarPanelHeaderService } from '@app/core/workspace/workspace-sidebar-panel-header.service';

/**
 * Base for Testing hub entries that swap the whole panel (Regression, Mock Server, …).
 */
@Component({
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export abstract class TestingProgrammaticSidebarPanelBase implements OnInit, OnDestroy {
  protected readonly testingSession = inject(TestingSessionService);
  private readonly panelHeader = inject(WorkspaceSidebarPanelHeaderService);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search');

  protected abstract panelTitle: string;

  constructor() {
    effect(() => {
      this.panelHeader.set({
        title: this.panelTitle,
        onBack: () => this.handleBack(),
      });
    });
  }

  ngOnInit(): void {
    this.testingSession.load();
  }

  ngOnDestroy(): void {
    this.panelHeader.clear();
  }

  protected handleBack(): void {
    this.testingSession.backToTestingMenu();
  }
}

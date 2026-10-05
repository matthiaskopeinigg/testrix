import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  TESTING_WORKSPACE_ID,
  TUTORIAL_CONTROL_FLOW_FLOW_ID,
  workspaceDisplayName,
} from '@testrix/contracts';
import { TxButtonComponent, TxHintComponent } from '@testrix/ui';

import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollectionsStore } from '../collections/collections.store';
import { HistoryStore } from '../history/history.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { ServicesStore } from '../services/services.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';

export type WelcomeSurface = 'request' | 'flow' | 'table';

const SURFACES: readonly WelcomeSurface[] = ['request', 'flow', 'table'];
const SURFACE_MS = 4800;

@Component({
  selector: 'tx-welcome',
  standalone: true,
  imports: [TxButtonComponent, TxHintComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeComponent {
  readonly shell = inject(ShellStateService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly history = inject(HistoryStore);
  private readonly collections = inject(CollectionsStore);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly services = inject(ServicesStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly surface = signal<WelcomeSurface>('request');
  readonly surfaces = SURFACES;

  readonly lastClosedLabel = computed(() => {
    const tab = this.workbench.lastClosedTab();
    if (!tab)
      return null;
    return `Reopen · ${tab.title || tab.url || 'Last closed tab'}`;
  });

  readonly lastHistoryLabel = computed(() => {
    const entry = this.history.entries()[0];
    if (!entry)
      return null;
    const label = entry.requestName || entry.url || 'Last request';
    return `History · ${label}`;
  });

  readonly recentWorkspaces = computed(() => {
    const activeId = this.workspaces.activeId();
    return this.workspaces
      .items()
      .filter((item) => item.id !== activeId)
      .slice(0, 3)
      .map((item) => ({ id: item.id, name: workspaceDisplayName(item) }));
  });

  readonly showResumeHub = computed(
    () =>
      !!this.lastClosedLabel() ||
      !!this.lastHistoryLabel() ||
      this.recentWorkspaces().length > 0 ||
      !this.collections.isTreeEmpty(),
  );

  readonly showSampleFlowCta = computed(
    () =>
      this.workspaces.items().some((item) => item.id === TESTING_WORKSPACE_ID) &&
      this.collections.isTreeEmpty(),
  );

  private cycleHandle = 0;
  private cyclePaused = false;

  constructor() {
    this.resetCycle();
    this.destroyRef.onDestroy(() => window.clearInterval(this.cycleHandle));
  }

  surfaceLabel(id: WelcomeSurface): string {
    switch (id) {
      case 'request':
        return 'Request';
      case 'flow':
        return 'Flow';
      case 'table':
        return 'Database';
    }
  }

  surfaceBlurb(): string {
    switch (this.surface()) {
      case 'request':
        return 'Build a call, tweak params, and read the response in one pane.';
      case 'flow':
        return 'Wire Start to End with browser steps, HTTP, and strings on the canvas.';
      case 'table':
        return 'Filter with WHERE, sort with ORDER BY, and edit rows in place.';
    }
  }

  selectSurface(id: WelcomeSurface): void {
    this.surface.set(id);
    this.resetCycle();
  }

  pauseCycle(): void {
    this.cyclePaused = true;
  }

  resumeCycle(): void {
    this.cyclePaused = false;
  }

  private resetCycle(): void {
    window.clearInterval(this.cycleHandle);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    this.cycleHandle = window.setInterval(() => {
      if (this.cyclePaused)
        return;
      const index = SURFACES.indexOf(this.surface());
      this.surface.set(SURFACES[(index + 1) % SURFACES.length]!);
    }, SURFACE_MS);
  }

  handleBrowseCollections(): void {
    this.shell.activeRail.set('collections');
    this.shell.showSidebar();
  }

  async handleOpenSampleFlow(): Promise<void> {
    if (this.workspaces.activeId() !== TESTING_WORKSPACE_ID) {
      const snapshot = await this.workspaces.switchTo(TESTING_WORKSPACE_ID);
      if (!snapshot)
        return;
      this.shell.playScene();
      this.session.applyActiveWorkspace();
    }
    this.shell.activeRail.set('services');
    this.shell.showSidebar();
    this.services.drillIn('flows');
    const sample = this.services.findFlow(TUTORIAL_CONTROL_FLOW_FLOW_ID);
    if (sample)
      this.services.openArtifact('flows', sample.id, sample.name);
    else
      await this.services.ensureTutorialFlows();
  }

  handleReopenLastClosed(): void {
    this.workbench.reopenLastClosed();
  }

  handleOpenLastHistory(): void {
    const entry = this.history.entries()[0];
    if (!entry)
      return;
    this.workbench.openFromHistory(entry);
  }

  async handleSwitchWorkspace(id: string): Promise<void> {
    const snapshot = await this.workspaces.switchTo(id);
    if (!snapshot)
      return;
    this.shell.playScene();
    this.session.applyActiveWorkspace();
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';

import type { ProfileEntry, ProfilesState } from '@shared/config';

import { CollectionsService } from '../collections/collections.service';
import { ConfigService } from '../config/config.service';
import { EnvironmentsService } from '../environments/environments.service';
import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';
import { HistoryService } from '../history/history.service';
import { CaptureWorkbenchStore } from '../testing/capture-workbench.store';
import { InterceptorWorkspaceStore } from '../testing/interceptor-workspace.store';
import { LoadTestService } from '../testing/load-test.service';
import { MockServerService } from '../testing/mock-server.service';
import { RegressionService } from '../testing/regression.service';
import { TestSuiteService } from '../testing/test-suite.service';
import { TestingSessionService } from '../testing/testing-session.service';
import { WorkspaceSidebarSessionService } from '../workspace/workspace-sidebar-session.service';
import { WorkspaceEditorService } from '../workspace/workspace-editor.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly configService = inject(ConfigService);
  private readonly collectionsService = inject(CollectionsService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly historyService = inject(HistoryService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly sidebarSession = inject(WorkspaceSidebarSessionService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly loadTest = inject(LoadTestService);
  private readonly regression = inject(RegressionService);
  private readonly mockServer = inject(MockServerService);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly interceptor = inject(InterceptorWorkspaceStore);

  private readonly profilesState = signal<readonly ProfileEntry[]>([]);
  private readonly activeProfileIdState = signal<string | null>(null);
  private readonly activeProfileDirState = signal<string | null>(null);
  private readonly switchingState = signal(false);

  readonly profiles = computed(() => this.profilesState());
  readonly activeProfileId = computed(() => this.activeProfileIdState());
  readonly activeProfileDir = computed(() => this.activeProfileDirState());
  readonly switching = computed(() => this.switchingState());

  readonly activeProfile = computed((): ProfileEntry | null => {
    const id = this.activeProfileIdState();
    if (!id) {
      return null;
    }
    return this.profilesState().find((p) => p.id === id) ?? null;
  });

  readonly profileDropdownOptions = computed(() =>
    this.profilesState().map((p) => ({
      value: p.id,
      label: p.name,
    })),
  );

  async hydrate(): Promise<void> {
    const api = this.electron.bridge();
    if (!api) {
      return;
    }

    try {
      const state = await api.config.getProfiles();
      this.applyProfilesState(state);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  async switchProfile(profileId: string): Promise<void> {
    if (this.switchingState() || profileId === this.activeProfileIdState()) {
      return;
    }

    const api = this.electron.bridge();
    if (!api) {
      return;
    }

    this.switchingState.set(true);
    try {
      await this.flushWorkspaceWrites();
      const state = await api.config.setActiveProfile(profileId);
      this.applyProfilesState(state);
      await this.rehydrateWorkspace();
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    } finally {
      this.switchingState.set(false);
    }
  }

  async createProfile(name: string): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return;
    }

    const api = this.electron.bridge();
    if (!api) {
      return;
    }

    this.switchingState.set(true);
    try {
      await this.flushWorkspaceWrites();
      const state = await api.config.createProfile(trimmed);
      this.applyProfilesState(state);
      await this.rehydrateWorkspace();
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    } finally {
      this.switchingState.set(false);
    }
  }

  async renameProfile(profileId: string, name: string): Promise<void> {
    const api = this.electron.bridge();
    if (!api) {
      return;
    }
    try {
      const state = await api.config.renameProfile({ id: profileId, name: name.trim() });
      this.applyProfilesState(state);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  async deleteProfile(profileId: string): Promise<void> {
    const api = this.electron.bridge();
    if (!api) {
      return;
    }
    try {
      const state = await api.config.deleteProfile(profileId);
      this.applyProfilesState(state);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private applyProfilesState(state: ProfilesState): void {
    this.profilesState.set([...state.profiles]);
    this.activeProfileIdState.set(state.activeProfileId);
    this.activeProfileDirState.set(state.activeProfileDir);
  }

  private async rehydrateWorkspace(): Promise<void> {
    await Promise.all([
      this.collectionsService.hydrate(),
      this.environmentsService.hydrate(),
      this.historyService.hydrate(),
      this.testSuite.hydrate(),
      this.loadTest.hydrate(),
      this.regression.hydrate(),
      this.mockServer.hydrate(),
      this.capture.hydrate(),
      this.interceptor.hydrate(),
    ]);
    await this.configService.hydrateSession();
    this.testingSession.rehydrateFromSession();
    this.sidebarSession.rehydrateFromSession();
    await this.workspaceEditor.pruneTabsForMissingProfileResources();
  }

  private async flushWorkspaceWrites(): Promise<void> {
    await Promise.all([
      this.collectionsService.flushPending(),
      this.environmentsService.flushPending(),
      this.historyService.flushPending(),
      this.workspaceEditor.flushPendingSession(),
      this.testingSession.flushPending(),
      this.sidebarSession.flushPending(),
    ]);
  }
}

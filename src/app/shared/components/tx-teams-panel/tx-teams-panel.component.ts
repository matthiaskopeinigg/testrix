import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TeamBranchEntry, TeamShareScope, TeamShareScopeKey } from '@shared/collaboration';
import {
  TEAM_SHARE_CATALOG,
  TEAM_SHARE_GROUP_LABELS,
  createDefaultTeamShareScope,
  type TeamShareCatalogGroup,
  describeSharedSyncFiles,
  ensureProfileSyncEntries,
  findProfileSyncEntry,
  formatRelativeCommitTime,
  isSameTeamAuthor,
  isSshGitRemoteUrl,
  listPublishableLocalProfiles,
  resolveEffectiveShareScope,
  summarizeShareScope,
  teamShareCatalogForGroup,
  formatRepoDataDirLabel,
  tryNormalizeRepoDataDir,
} from '@shared/collaboration';
import { isTeamProfile } from '@shared/config';
import { TEAM_ALWAYS_EXCLUDED_FILES } from '@shared/collaboration/share-scope-files';

import { ProfileService } from '@app/core/profile/profile.service';
import { TeamSyncService } from '@app/core/collaboration/team-sync.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { readEntranceStaggerSettleMs } from '@app/core/ui/workspace-tab-motion';
import { TxSectionNavSliderDirective } from '@app/shared/directives/tx-section-nav-slider.directive';

import { TxAuthorAvatarComponent } from '../tx-author-avatar/tx-author-avatar.component';
import { TxBannerComponent } from '../tx-banner/tx-banner.component';
import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';
import { TxConfirmDialogComponent } from '../tx-confirm-dialog/tx-confirm-dialog.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxSliderComponent } from '../tx-slider/tx-slider.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';
import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';
import { TxTeamCommitDiffComponent } from '../tx-team-commit-diff/tx-team-commit-diff.component';
import { TxToggleComponent } from '../tx-toggle/tx-toggle.component';

type TeamsTab = 'overview' | 'team-profiles' | 'settings' | 'history' | 'branches';
type ConnectWizardStep = 'connect' | 'discover' | 'done';

const TEAMS_SECTION_TABS: readonly { readonly id: TeamsTab; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'team-profiles', label: 'Team profiles' },
  { id: 'settings', label: 'Settings' },
  { id: 'history', label: 'History' },
  { id: 'branches', label: 'Branches' },
];

@Component({
  selector: 'tx-teams-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxAuthorAvatarComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxConfirmDialogComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxModalComponent,
    TxSliderComponent,
    TxSpinnerComponent,
    TxTagComponent,
    TxTeamCommitDiffComponent,
    TxToggleComponent,
    TxSectionNavSliderDirective,
  ],
  templateUrl: './tx-teams-panel.component.html',
  styleUrl: './tx-teams-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxTeamsPanelComponent {
  readonly open = input(false);

  readonly closed = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  protected readonly profiles = inject(ProfileService);
  protected readonly teamSync = inject(TeamSyncService);
  private readonly notifications = inject(TxNotificationService);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly isVisible = signal(false);
  protected readonly isShown = signal(false);
  protected readonly contentStaggerPlay = signal(false);
  protected readonly contentStaggerSettled = signal(false);

  protected readonly activeTab = signal<TeamsTab>('overview');
  protected readonly connectWizardStep = signal<ConnectWizardStep>('connect');
  protected readonly selectedImportIds = signal<readonly string[]>([]);
  protected readonly newTeamProfileName = signal('');
  protected readonly publishLocalProfileId = signal('');
  protected readonly remoteUrl = signal('');
  protected readonly remoteToken = signal('');
  protected readonly authorName = signal('Testrix User');
  protected readonly authorEmail = signal('testrix@example.com');
  protected readonly newBranchName = signal('');
  protected readonly historyFilterMine = signal(false);
  protected readonly selectedCommitHash = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingCommit = signal(false);
  protected readonly loadingMoreHistory = signal(false);
  protected readonly showTokenField = signal(false);
  protected readonly connectingGit = signal(false);
  protected readonly connectStep = signal(0);
  protected readonly expandedProfileIds = signal<readonly string[]>([]);
  protected readonly branchBusy = signal<{ readonly name: string; readonly action: 'create' | 'switch' | 'delete' } | null>(
    null,
  );
  protected readonly connectRepoDataDirOpen = signal(false);
  protected readonly repoDirectoryOptions = signal<readonly string[]>([]);
  protected readonly extraRepoDataDirOptions = signal<readonly string[]>([]);
  protected readonly pendingRepoDataDir = signal('');
  protected readonly newRepoDataDirInput = signal('');
  protected readonly newRepoDataDirError = signal('');
  protected readonly loadingRepoDirectories = signal(false);
  protected readonly disconnectConfirmOpen = signal(false);

  protected readonly status = this.teamSync.status;
  protected readonly config = this.teamSync.config;
  protected readonly history = this.teamSync.history;
  protected readonly branches = this.teamSync.branches;
  protected readonly commitDetail = this.teamSync.commitDetail;
  protected readonly gitSetup = this.teamSync.gitSetup;

  protected readonly statusVariant = computed((): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    if (this.isSyncPaused()) {
      return 'warning';
    }
    switch (this.status().status) {
      case 'synced':
        return 'success';
      case 'failed':
      case 'conflict':
        return 'error';
      case 'offline':
        return 'warning';
      case 'syncing':
        return 'info';
      case 'dirty':
        return 'warning';
      case 'idle':
        return 'info';
      default:
        return 'default';
    }
  });

  protected readonly remoteCatalog = this.teamSync.remoteCatalog;

  protected readonly showSetup = computed(
    () => this.status().status === 'not-configured' || !this.config()?.enabled,
  );

  protected readonly showConnectWizard = computed(
    () => this.showSetup() && this.connectWizardStep() !== 'done',
  );

  protected readonly canDisconnectFromGit = computed(() => {
    const config = this.config();
    const setup = this.gitSetup();
    return Boolean(
      config?.enabled ||
        config?.remoteUrl ||
        setup.gitRemoteUrl ||
        setup.remoteUrl,
    );
  });

  protected readonly disconnectRemoteLabel = computed(() => {
    const config = this.config();
    const setup = this.gitSetup();
    return config?.remoteUrl ?? setup.gitRemoteUrl ?? setup.remoteUrl ?? 'Git remote';
  });

  protected readonly importableRemoteProfiles = computed(
    () => this.remoteCatalog()?.profiles.filter((profile) => !profile.imported) ?? [],
  );

  protected readonly publishableLocalProfiles = computed(() =>
    listPublishableLocalProfiles(this.profiles.profiles()),
  );

  protected readonly visibleSectionTabs = computed(() => {
    if (this.showSetup()) {
      return TEAMS_SECTION_TABS.filter((tab) => tab.id !== 'history' && tab.id !== 'branches');
    }
    return TEAMS_SECTION_TABS;
  });

  protected readonly shareCatalogGroups: readonly TeamShareCatalogGroup[] = ['core', 'testing', 'advanced'];

  protected readonly connectSteps = ['Saving author', 'Connecting to remote', 'Fetching team profiles'] as const;

  protected readonly TEAM_SHARE_CATALOG = TEAM_SHARE_CATALOG;

  protected readonly isSyncPaused = this.teamSync.isAutoSyncPaused;

  protected readonly authTagVariant = computed((): 'success' | 'warning' | 'info' | 'default' => {
    const setup = this.gitSetup();
    if (setup.canAccessRemote) {
      return setup.authMethod === 'system' ? 'success' : 'info';
    }
    return 'warning';
  });

  protected readonly authLabel = computed(() => {
    const setup = this.gitSetup();
    if (setup.authMethod === 'system') {
      return 'System Git credentials';
    }
    if (setup.authMethod === 'token') {
      return 'Personal access token';
    }
    return 'Not authenticated';
  });

  protected readonly canConnectWithoutToken = computed(() => {
    const url = this.effectiveRemoteUrl();
    if (isSshGitRemoteUrl(url)) {
      return true;
    }
    const setup = this.gitSetup();
    return setup.canAccessRemote && setup.authMethod === 'system';
  });

  protected readonly usesSshRemote = computed(() => isSshGitRemoteUrl(this.effectiveRemoteUrl()));

  private effectiveRemoteUrl(): string {
    return this.remoteUrl().trim() || this.gitSetup().remoteUrl?.trim() || this.config()?.remoteUrl?.trim() || '';
  }

  protected readonly currentAuthorEmail = computed(() => this.config()?.commitAuthor.email ?? null);

  protected readonly TEAM_ALWAYS_LOCAL_FILES = TEAM_ALWAYS_EXCLUDED_FILES;

  protected readonly sharedFilesForActiveProfile = computed(() => {
    const config = this.config();
    const activeId = this.profiles.activeProfileId();
    if (!config || !activeId) {
      return [] as readonly string[];
    }
    return describeSharedSyncFiles(resolveEffectiveShareScope(config, activeId));
  });

  protected readonly syncingProfileLabels = computed(() =>
    this.profiles.teamProfiles().map((profile) => profile.name),
  );

  protected readonly teamRepoFolder = computed(() => this.config()?.teamRepoDir ?? 'Team workspace folder');

  protected readonly repoDataDirLabel = computed(() =>
    formatRepoDataDirLabel(this.config()?.repoDataDir),
  );

  protected readonly selectedRepoDataDirLabel = computed(() =>
    formatRepoDataDirLabel(this.pendingRepoDataDir()),
  );

  protected readonly visibleRepoDirectoryOptions = computed(() => {
    const merged = [...this.repoDirectoryOptions()];
    for (const dir of this.extraRepoDataDirOptions()) {
      if (!merged.includes(dir)) {
        merged.push(dir);
      }
    }
    return merged.sort((a, b) => a.localeCompare(b));
  });

  protected readonly profileSyncSummaries = computed(() => {
    const config = this.config();
    if (!config) {
      return new Map<string, string>();
    }
    const summaries = new Map<string, string>();
    for (const profile of this.profiles.teamProfiles()) {
      const entry = findProfileSyncEntry(config.profileSync, profile.id);
      const scope = entry?.useCustomShareScope ? entry.shareScope : config.shareScope;
      summaries.set(profile.id, summarizeShareScope(scope));
    }
    return summaries;
  });

  protected readonly autoSyncSummary = computed(() => {
    const c = this.config();
    if (!c?.enabled) {
      return 'Not connected';
    }
    if (!c.autoSync.enabled) {
      return 'Manual only';
    }
    const parts: string[] = [];
    if (c.autoSync.commitOnSave) {
      parts.push('save');
    }
    if (c.autoSync.pullOnFocus) {
      parts.push('focus');
    }
    if (c.autoSync.pullIntervalSec > 0) {
      parts.push(`every ${formatSyncInterval(c.autoSync.pullIntervalSec)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Manual only';
  });

  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private staggerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.beginOpen();
        return;
      }

      if (this.isVisible()) {
        this.beginClose();
      }
    });

    effect(() => {
      if (
        this.showSetup() &&
        (this.activeTab() === 'history' || this.activeTab() === 'branches')
      ) {
        this.activeTab.set('overview');
      }
    });

    this.destroyRef.onDestroy(() => {
      this.cancelCloseTimer();
      this.cancelStaggerTimer();
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (!this.open() || !this.isVisible()) {
      return;
    }
    this.handleClose();
  }

  protected handleClose(): void {
    if (!this.open() && !this.isVisible()) {
      return;
    }
    this.closed.emit();
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  protected handleTabSelect(tab: TeamsTab): void {
    if (tab !== 'history' && this.selectedCommitHash()) {
      this.selectedCommitHash.set(null);
      this.teamSync.clearCommitDetail();
    }
    this.activeTab.set(tab);
    this.armContentStagger();
    if (tab === 'history') {
      void this.teamSync.loadHistory();
    }
    if (tab === 'branches') {
      void this.teamSync.loadBranches();
    }
  }

  protected handleToggleTokenField(): void {
    this.showTokenField.update((v) => !v);
  }

  protected async handleSyncNow(): Promise<void> {
    this.loading.set(true);
    try {
      await this.teamSync.syncNow();
      this.notifications.showSuccess('Sync complete');
    } catch {
      this.notifications.showError('Sync failed');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleConnectRemote(): Promise<void> {
    const url = this.remoteUrl().trim();
    if (!url) {
      this.notifications.showError('Remote URL is required');
      return;
    }

    const token = this.remoteToken().trim();
    if (!token && !this.canConnectWithoutToken()) {
      this.notifications.showError(
        'Configure Git credentials on your system or add an optional HTTPS access token',
      );
      return;
    }

    await this.runConnectRemotePhase1();
  }

  protected handleCancelRepoDataDirModal(): void {
    this.connectRepoDataDirOpen.set(false);
  }

  protected handleSelectRepoDataDir(dir: string): void {
    this.newRepoDataDirError.set('');
    this.pendingRepoDataDir.set(dir);
  }

  protected handleApplyNewRepoDataDir(): void {
    const result = tryNormalizeRepoDataDir(this.newRepoDataDirInput());
    if (!result.ok) {
      this.newRepoDataDirError.set(result.error);
      return;
    }

    this.newRepoDataDirError.set('');
    this.pendingRepoDataDir.set(result.value);
    if (!this.repoDirectoryOptions().includes(result.value)) {
      this.extraRepoDataDirOptions.update((dirs) =>
        dirs.includes(result.value) ? dirs : [...dirs, result.value],
      );
    }
  }

  protected async handleConfirmRepoDataDirAndConnect(): Promise<void> {
    const pendingInput = this.newRepoDataDirInput().trim();
    if (pendingInput.length > 0 && pendingInput !== this.pendingRepoDataDir()) {
      const result = tryNormalizeRepoDataDir(pendingInput);
      if (!result.ok) {
        this.newRepoDataDirError.set(result.error);
        return;
      }
      this.pendingRepoDataDir.set(result.value);
    }

    this.connectRepoDataDirOpen.set(false);
    await this.runConnectRemotePhase2(this.pendingRepoDataDir());
  }

  private async runConnectRemotePhase1(): Promise<void> {
    const url = this.remoteUrl().trim();
    const token = this.remoteToken().trim();

    this.loading.set(true);
    this.connectingGit.set(true);
    this.connectStep.set(0);
    try {
      this.connectStep.set(1);
      await this.teamSync.saveConfig({
        commitAuthor: { name: this.authorName().trim(), email: this.authorEmail().trim() },
      });
      this.connectStep.set(2);
      await this.teamSync.setRemote(url, token || null);
      this.loadingRepoDirectories.set(true);
      const directories = await this.teamSync.listRepoDirectories();
      this.repoDirectoryOptions.set(directories);
      this.extraRepoDataDirOptions.set([]);
      this.newRepoDataDirInput.set('');
      this.newRepoDataDirError.set('');
      const defaultDir = directories.includes('profiles') ? 'profiles' : (directories[0] ?? '');
      this.pendingRepoDataDir.set(defaultDir);
      this.connectRepoDataDirOpen.set(true);
    } catch {
      this.notifications.showError('Could not connect remote — check URL and credentials');
    } finally {
      this.connectingGit.set(false);
      this.connectStep.set(0);
      this.loading.set(false);
      this.loadingRepoDirectories.set(false);
    }
  }

  private async runConnectRemotePhase2(repoDataDir: string): Promise<void> {
    this.loading.set(true);
    this.connectingGit.set(true);
    this.connectStep.set(3);
    try {
      await this.teamSync.saveConfig({ repoDataDir });
      await this.delay(320);
      const result = await this.teamSync.fetchRemoteCatalog({ importMissing: true });
      const remaining = result.profiles.filter((profile) => !profile.imported);

      if (remaining.length > 0) {
        this.connectWizardStep.set('discover');
        this.selectedImportIds.set(remaining.map((profile) => profile.id));
        this.notifications.showSuccess('Connected — finish importing team profiles');
      } else if (result.profiles.length === 0) {
        this.connectWizardStep.set('discover');
        this.notifications.showSuccess('Connected — create or publish team profiles when ready');
      } else {
        this.connectWizardStep.set('done');
        this.activeTab.set('team-profiles');
        const importedCount = result.importedProfileIds.length;
        if (importedCount > 0) {
          this.notifications.showSuccess(
            `Connected — imported ${importedCount} team profile${importedCount === 1 ? '' : 's'}`,
          );
        } else {
          this.notifications.showSuccess('Connected');
        }
      }
    } catch {
      this.notifications.showError('Could not finish connecting — check repository folder and try again');
    } finally {
      this.connectingGit.set(false);
      this.connectStep.set(0);
      this.loading.set(false);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async handlePauseSync(): Promise<void> {
    this.loading.set(true);
    try {
      await this.teamSync.pauseAutoSync();
      this.notifications.showSuccess('Auto sync paused');
    } catch {
      this.notifications.showError('Could not pause sync');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleResumeSync(): Promise<void> {
    this.loading.set(true);
    try {
      await this.teamSync.resumeAutoSync();
      this.notifications.showSuccess('Auto sync resumed');
    } catch {
      this.notifications.showError('Could not resume sync');
    } finally {
      this.loading.set(false);
    }
  }

  protected handleRequestDisconnect(): void {
    this.disconnectConfirmOpen.set(true);
  }

  protected handleCancelDisconnect(): void {
    this.disconnectConfirmOpen.set(false);
  }

  protected async handleConfirmDisconnect(): Promise<void> {
    this.disconnectConfirmOpen.set(false);
    this.loading.set(true);
    try {
      await this.teamSync.disconnect();
      this.remoteUrl.set('');
      this.remoteToken.set('');
      this.connectWizardStep.set('connect');
      this.activeTab.set('overview');
      await this.applyGitSetupToForm();
      this.notifications.showSuccess('Disconnected from Git repository');
    } catch {
      this.notifications.showError('Could not disconnect from Git remote');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleShareScopeChange(key: keyof TeamShareScope, value: boolean): Promise<void> {
    const current = this.config();
    if (!current) {
      return;
    }
    await this.teamSync.saveConfig({
      shareScope: { ...current.shareScope, [key]: value },
    });
  }

  protected async handleAutoSyncToggle(
    key: 'enabled' | 'commitOnSave' | 'pullOnFocus',
    value: boolean,
  ): Promise<void> {
    const current = this.config();
    if (!current) {
      return;
    }
    await this.teamSync.saveConfig({
      autoSync: { ...current.autoSync, [key]: value },
    });
  }

  protected async handleAutoSyncNumber(key: 'pullIntervalSec' | 'pushRetrySec', value: number): Promise<void> {
    const current = this.config();
    if (!current || !Number.isFinite(value)) {
      return;
    }
    await this.teamSync.saveConfig({
      autoSync: { ...current.autoSync, [key]: Math.round(value) },
    });
  }

  protected async handleCreateBranch(): Promise<void> {
    const name = this.newBranchName().trim();
    if (!name || this.branchBusy()) {
      return;
    }
    this.branchBusy.set({ name, action: 'create' });
    try {
      await this.teamSync.createBranch(name);
      this.newBranchName.set('');
      this.notifications.showSuccess(`Branch "${name}" created and pushed`);
    } catch {
      this.notifications.showError(`Could not create or push branch "${name}"`);
    } finally {
      this.branchBusy.set(null);
    }
  }

  protected async handleSwitchBranch(name: string): Promise<void> {
    if (this.branchBusy()) {
      return;
    }
    this.branchBusy.set({ name, action: 'switch' });
    try {
      await this.teamSync.switchBranch(name);
      this.notifications.showSuccess(`Switched to ${name} and synced with remote`);
    } catch {
      this.notifications.showError(`Could not switch to branch "${name}"`);
    } finally {
      this.branchBusy.set(null);
    }
  }

  protected async handleDeleteBranch(name: string): Promise<void> {
    const branch = this.branches().find((b) => b.name === name);
    if (this.branchBusy() || !branch || !this.canDeleteBranch(branch)) {
      return;
    }
    this.branchBusy.set({ name, action: 'delete' });
    try {
      await this.teamSync.deleteBranch(name);
      this.notifications.showSuccess(`Branch "${name}" deleted`);
    } catch {
      this.notifications.showError(`Could not delete branch "${name}"`);
    } finally {
      this.branchBusy.set(null);
    }
  }

  protected canDeleteBranch(branch: TeamBranchEntry): boolean {
    if (branch.current || branch.name.includes(' -> ') || branch.name === 'HEAD') {
      return false;
    }
    return branch.name !== (this.config()?.defaultBranch ?? 'main');
  }

  protected shareGroupLabel(group: TeamShareCatalogGroup): string {
    return TEAM_SHARE_GROUP_LABELS[group];
  }

  protected shareEntriesForGroup(group: TeamShareCatalogGroup) {
    return teamShareCatalogForGroup(group);
  }

  protected profileSyncEntry(profileId: string) {
    return findProfileSyncEntry(this.config()?.profileSync ?? { entries: [] }, profileId);
  }

  protected isProfileExpanded(profileId: string): boolean {
    return this.expandedProfileIds().includes(profileId);
  }

  protected handleToggleProfileExpanded(profileId: string): void {
    const current = this.expandedProfileIds();
    this.expandedProfileIds.set(
      current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId],
    );
  }

  protected isImportSelected(profileId: string): boolean {
    return this.selectedImportIds().includes(profileId);
  }

  protected handleToggleImportSelection(profileId: string, selected: boolean): void {
    const current = this.selectedImportIds();
    if (selected) {
      if (!current.includes(profileId)) {
        this.selectedImportIds.set([...current, profileId]);
      }
      return;
    }
    this.selectedImportIds.set(current.filter((id) => id !== profileId));
  }

  protected async handleImportSelectedProfiles(): Promise<void> {
    const ids = this.selectedImportIds();
    if (ids.length === 0) {
      this.connectWizardStep.set('done');
      this.activeTab.set('team-profiles');
      return;
    }
    this.loading.set(true);
    try {
      await this.teamSync.importProfiles(ids);
      this.connectWizardStep.set('done');
      this.activeTab.set('team-profiles');
      this.notifications.showSuccess(`Imported ${ids.length} team profile${ids.length === 1 ? '' : 's'}`);
    } catch {
      this.notifications.showError('Could not import team profiles');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleCreateTeamProfileFromWizard(): Promise<void> {
    const name = this.newTeamProfileName().trim();
    if (!name) {
      this.notifications.showError('Profile name is required');
      return;
    }
    this.loading.set(true);
    try {
      await this.teamSync.createTeamProfile(name);
      this.newTeamProfileName.set('');
      this.connectWizardStep.set('done');
      this.activeTab.set('team-profiles');
      this.notifications.showSuccess(`Team profile "${name}" created`);
    } catch {
      this.notifications.showError('Could not create team profile');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handlePublishLocalProfile(): Promise<void> {
    const profileId = this.publishLocalProfileId().trim();
    if (!profileId) {
      this.notifications.showError('Select a local profile to publish');
      return;
    }
    this.loading.set(true);
    try {
      await this.teamSync.publishLocalProfile(profileId);
      this.publishLocalProfileId.set('');
      this.connectWizardStep.set('done');
      this.activeTab.set('team-profiles');
      this.notifications.showSuccess('Local profile published to team');
    } catch {
      this.notifications.showError('Could not publish profile');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleUnpublishProfile(profileId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.teamSync.unpublishProfile(profileId);
      this.notifications.showSuccess('Profile is now local only');
    } catch {
      this.notifications.showError('Could not unpublish profile');
    } finally {
      this.loading.set(false);
    }
  }

  protected async handleImportRemoteProfile(profileId: string): Promise<void> {
    this.loading.set(true);
    try {
      await this.teamSync.importProfiles([profileId]);
      this.notifications.showSuccess('Team profile imported');
    } catch {
      this.notifications.showError('Could not import team profile');
    } finally {
      this.loading.set(false);
    }
  }

  protected handleSkipImportWizard(): void {
    this.connectWizardStep.set('done');
    this.activeTab.set('team-profiles');
  }

  protected async handleProfileCustomScopeChange(profileId: string, useCustom: boolean): Promise<void> {
    const current = this.config();
    if (!current) {
      return;
    }
    const entries = current.profileSync.entries.map((entry) =>
      entry.profileId === profileId
        ? { ...entry, useCustomShareScope: useCustom, shareScope: entry.shareScope ?? { ...current.shareScope } }
        : entry,
    );
    await this.teamSync.saveConfig({ profileSync: { ...current.profileSync, entries } });
  }

  protected async handleProfileShareScopeChange(
    profileId: string,
    key: TeamShareScopeKey,
    value: boolean,
  ): Promise<void> {
    const current = this.config();
    if (!current) {
      return;
    }
    const entries = current.profileSync.entries.map((entry) => {
      if (entry.profileId !== profileId) {
        return entry;
      }
      return {
        ...entry,
        shareScope: { ...entry.shareScope, [key]: value },
      };
    });
    await this.teamSync.saveConfig({ profileSync: { ...current.profileSync, entries } });
  }

  protected profileShareScopeValue(profileId: string, key: TeamShareScopeKey): boolean {
    const entry = this.profileSyncEntry(profileId);
    return entry?.shareScope[key] ?? this.config()?.shareScope[key] ?? false;
  }

  protected async handleSelectCommit(hash: string): Promise<void> {
    if (this.selectedCommitHash() === hash && this.commitDetail()) {
      return;
    }
    this.selectedCommitHash.set(hash);
    this.scrollPanelBodyToTop();
    this.loadingCommit.set(true);
    try {
      await this.teamSync.loadCommitDetail(hash);
    } finally {
      this.loadingCommit.set(false);
    }
  }

  protected handleBackToHistoryList(): void {
    this.selectedCommitHash.set(null);
    this.teamSync.clearCommitDetail();
    this.scrollPanelBodyToTop();
  }

  private readonly panelBody = viewChild<ElementRef<HTMLElement>>('panelBody');

  private scrollPanelBodyToTop(): void {
    this.panelBody()?.nativeElement.scrollTo({ top: 0 });
  }

  protected async handleLoadMoreHistory(): Promise<void> {
    this.loadingMoreHistory.set(true);
    try {
      await this.teamSync.loadMoreHistory();
    } finally {
      this.loadingMoreHistory.set(false);
    }
  }

  protected formatHistoryWhen(iso: string): string {
    return formatRelativeCommitTime(iso);
  }

  protected isCurrentAuthor(email: string): boolean {
    return isSameTeamAuthor(email, this.currentAuthorEmail());
  }

  protected profileSyncSummary(profileId: string): string {
    return this.profileSyncSummaries().get(profileId) ?? summarizeShareScope(createDefaultTeamShareScope());
  }

  protected isTeamProfileEntry(profileId: string): boolean {
    const profile = this.profiles.profiles().find((entry) => entry.id === profileId);
    return profile ? isTeamProfile(profile) : false;
  }

  protected conflictResolutionLabel(resolution: 'ours' | 'theirs' | 'abort'): string {
    switch (resolution) {
      case 'ours':
        return 'Use local';
      case 'theirs':
        return 'Use remote';
      default:
        return 'Cancel sync';
    }
  }

  protected async handleResolveConflict(resolution: 'ours' | 'theirs' | 'abort'): Promise<void> {
    await this.teamSync.resolveConflict(resolution);
    this.notifications.showSuccess('Conflict resolved');
  }

  protected filteredHistory = computed(() => {
    const entries = this.history().entries;
    if (!this.historyFilterMine()) {
      return entries;
    }
    const email = this.config()?.commitAuthor.email ?? '';
    return entries.filter((e) => e.authorEmail === email);
  });

  private beginOpen(): void {
    this.cancelCloseTimer();
    this.isVisible.set(true);
    this.isShown.set(false);
    this.contentStaggerPlay.set(false);
    this.contentStaggerSettled.set(false);
    void this.refreshSetupForm();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.open()) {
          this.isShown.set(true);
          this.armContentStagger();
        }
      });
    });
  }

  private beginClose(): void {
    this.isShown.set(false);
    this.contentStaggerPlay.set(false);
    this.contentStaggerSettled.set(false);
    this.cancelStaggerTimer();
    this.cancelCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.isVisible.set(false);
    }, this.panelCloseMs());
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private armContentStagger(): void {
    this.cancelStaggerTimer();
    this.contentStaggerSettled.set(false);

    if (!this.uiPreferences.entranceStaggerEnabled()) {
      this.contentStaggerPlay.set(true);
      this.contentStaggerSettled.set(true);
      return;
    }

    this.contentStaggerPlay.set(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.isVisible() || !this.isShown()) {
          return;
        }
        this.contentStaggerPlay.set(true);
        this.staggerTimer = setTimeout(() => {
          this.staggerTimer = null;
          this.contentStaggerSettled.set(true);
        }, readEntranceStaggerSettleMs(10));
      });
    });
  }

  private cancelStaggerTimer(): void {
    if (this.staggerTimer !== null) {
      clearTimeout(this.staggerTimer);
      this.staggerTimer = null;
    }
  }

  private async refreshSetupForm(): Promise<void> {
    await Promise.all([
      this.teamSync.loadGitSetup(),
      this.teamSync.loadConfig(),
      this.profiles.hydrate(),
    ]);
    await this.ensureProfileSyncEntries();
    this.applyGitSetupToForm();
    if (this.config()?.enabled) {
      this.connectWizardStep.set('done');
      void this.teamSync.fetchRemoteCatalog({ importMissing: true });
    }
  }

  private async ensureProfileSyncEntries(): Promise<void> {
    const config = this.config();
    if (!config) {
      return;
    }
    const next = ensureProfileSyncEntries(this.profiles.profiles(), config.profileSync);
    if (JSON.stringify(next.entries) !== JSON.stringify(config.profileSync.entries)) {
      await this.teamSync.saveConfig({ profileSync: next });
    }
  }

  private applyGitSetupToForm(): void {
    const setup = this.gitSetup();
    const config = this.config();

    if (config?.enabled) {
      if (setup.remoteUrl) {
        this.remoteUrl.set(setup.remoteUrl);
      } else if (config.remoteUrl) {
        this.remoteUrl.set(config.remoteUrl);
      }
    } else if (config?.remoteUrl) {
      this.remoteUrl.set(config.remoteUrl);
    } else {
      this.remoteUrl.set('');
    }

    if (setup.identity.name) {
      this.authorName.set(setup.identity.name);
    } else if (config?.commitAuthor.name) {
      this.authorName.set(config.commitAuthor.name);
    }

    if (setup.identity.email) {
      this.authorEmail.set(setup.identity.email);
    } else if (config?.commitAuthor.email) {
      this.authorEmail.set(config.commitAuthor.email);
    }

    this.showTokenField.set(
      !isSshGitRemoteUrl(this.effectiveRemoteUrl()) &&
        (setup.hasStoredToken || (!setup.canAccessRemote && Boolean(setup.remoteUrl))),
    );
  }

  private panelCloseMs(): number {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const styles = root ? getComputedStyle(root) : null;
    const motionScale = styles ? Number.parseFloat(styles.getPropertyValue('--tx-motion-scale')) || 1 : 1;
    return Math.round(320 * motionScale);
  }
}

function formatSyncInterval(seconds: number): string {
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)}h`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)}m`;
  }
  return `${seconds}s`;
}

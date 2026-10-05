import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  CollabActivity,
  CollabChange,
  CollabDockTab,
  CollabLock,
  CollabRepoSummary,
  CollabRunSummary,
} from '@testrix/contracts';
import { TxButtonComponent, TxEmptyStateComponent, TxHintComponent, TxSpinnerComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { ShellStateService } from '../../core/shell-state.service';
import { ServicesStore } from '../services/services.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabKindIconComponent } from './collab-kind-icon.component';
import { CollabWorkspacesTabComponent } from './collab-workspaces-tab.component';
import { CollabStore, formatDuration, relativeTime, type CollabActivityFilter } from './collab.store';

interface FilterTab {
  readonly id: CollabActivityFilter;
  readonly label: string;
}

interface DockTab {
  readonly id: CollabDockTab;
  readonly label: string;
}

/**
 * The Collab dock: a repository header with its sync controls, then tabs for the
 * overview, the repository's workspaces, activity, people, and team runs.
 */
@Component({
  selector: 'tx-collab-panel',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TxButtonComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxSpinnerComponent,
    CollabKindIconComponent,
    CollabWorkspacesTabComponent,
  ],
  templateUrl: './collab-panel.component.html',
  styleUrl: './collab-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabPanelComponent {
  readonly collab = inject(CollabStore);
  private readonly shell = inject(ShellStateService);
  private readonly services = inject(ServicesStore);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly confirm = inject(ConfirmDialogService);

  readonly repoMenuOpen = signal(false);
  readonly moreOpen = signal(false);

  readonly tabs: readonly DockTab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'workspaces', label: 'Workspaces' },
    { id: 'activity', label: 'Activity' },
    { id: 'people', label: 'People' },
    { id: 'runs', label: 'Runs' },
  ];

  readonly filters: readonly FilterTab[] = [
    { id: 'all', label: 'All' },
    { id: 'change', label: 'Changes' },
    { id: 'run', label: 'Runs' },
    { id: 'people', label: 'People' },
  ];

  readonly activeName = computed(() => this.workspaces.active()?.name?.trim() || 'This workspace');

  badgeFor(tab: CollabDockTab): string | null {
    if (!this.collab.dockIsActiveRepo())
      return null;
    if (tab === 'overview') {
      const reviews = this.collab.status().reviews.length;
      return reviews > 0 ? String(reviews) : null;
    }
    if (tab === 'runs') {
      const live = this.collab.liveRuns().length;
      return live > 0 ? String(live) : null;
    }
    if (tab === 'people') {
      const active = this.collab.activePresence().filter((person) => !person.isYou).length;
      return active > 0 ? String(active) : null;
    }
    return null;
  }

  onPcCount(repo: CollabRepoSummary): number {
    return repo.workspaces.filter((entry) => entry.localId !== null).length;
  }

  firstLinked(repo: CollabRepoSummary): string | null {
    return repo.workspaces.find((entry) => entry.localId !== null)?.localId ?? null;
  }

  linkedName(repo: CollabRepoSummary, localId: string): string {
    return repo.workspaces.find((entry) => entry.localId === localId)?.name ?? 'workspace';
  }

  toggleRepoMenu(): void {
    this.moreOpen.set(false);
    this.repoMenuOpen.update((open) => !open);
  }

  toggleMore(): void {
    this.repoMenuOpen.set(false);
    this.moreOpen.update((open) => !open);
  }

  pickRepo(repoId: string): void {
    this.repoMenuOpen.set(false);
    this.collab.showRepo(repoId);
  }

  connectAnother(): void {
    this.repoMenuOpen.set(false);
    this.collab.openConnect();
  }

  addFromRepo(repoId: string): void {
    this.moreOpen.set(false);
    this.collab.openAddFromRepo(repoId);
  }

  async copyAddress(repoId: string): Promise<void> {
    this.moreOpen.set(false);
    await this.collab.copyRemote(repoId);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
    return (letters || name.slice(0, 2) || '?').toUpperCase();
  }

  when(at: string | null): string {
    return at ? relativeTime(at) : '';
  }

  runLine(run: CollabRunSummary): string {
    const parts = [run.owner];
    if (run.environment)
      parts.push(run.environment);
    parts.push(formatDuration(run.durationMs));
    return parts.join(' · ');
  }

  runResult(run: CollabRunSummary): string {
    if (run.status === 'cancelled')
      return 'Stopped';
    if (run.failed > 0)
      return `${run.failed} of ${run.total} failed`;
    return `${run.passed} passed`;
  }

  lockProgress(lock: CollabLock): string {
    return lock.total > 0 ? `${lock.completed}/${lock.total}` : 'starting';
  }

  progressPercent(lock: CollabLock): number {
    if (lock.total <= 0)
      return 0;
    return Math.min(100, Math.round((lock.completed / lock.total) * 100));
  }

  /** Opens the pack a live run points at and toasts once when it finishes. */
  watch(lock: CollabLock): void {
    this.collab.watchRun(lock.packId);
    this.openPack(lock.packId);
  }

  openLock(lock: CollabLock): void {
    this.openPack(lock.packId);
  }

  openRun(run: CollabRunSummary): void {
    this.openPack(run.packId);
  }

  openActivity(row: CollabActivity): void {
    if (row.target)
      this.collab.openTarget(row.target.kind, row.target.id);
  }

  openChange(change: CollabChange): void {
    this.collab.openTarget(change.kind, change.id, change.label);
  }

  async takeOver(lock: CollabLock): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Take over ${lock.packName}?`,
      body: `${lock.owner}'s run stopped reporting. Taking over lets you run this pack now.`,
      confirmLabel: 'Take over',
      cancelLabel: 'Cancel',
    });
    if (!ok)
      return;
    const claimed = await this.collab.takeOverLock({
      packId: lock.packId,
      packName: lock.packName,
      environment: lock.environment,
    });
    if (claimed)
      this.openPack(lock.packId);
  }

  failedLine(run: CollabRunSummary): string {
    return run.failedNames.length > 0 ? run.failedNames.join(', ') : '';
  }

  runsEmptyCopy(): string {
    const status = this.collab.status();
    if (status.state === 'paused')
      return 'Sync is paused, so team runs stay on the other PCs until you resume.';
    if (status.state === 'offline')
      return 'You are offline. Team runs appear after the next sync.';
    if (!status.shareRuns)
      return 'Share regression results is off, so this PC does not publish run outcomes.';
    if (status.presence.length === 0)
      return `No team runs in ${this.activeName()} yet. Only you are here.`;
    return `No team runs in ${this.activeName()} yet.`;
  }

  openSettings(): void {
    this.moreOpen.set(false);
    this.shell.openSettings('collab');
  }

  async disconnect(repo: CollabRepoSummary): Promise<void> {
    this.moreOpen.set(false);
    const count = this.onPcCount(repo);
    const ok = await this.confirm.ask({
      title: `Disconnect ${repo.repoName}`,
      body:
        count > 0
          ? `Its ${count === 1 ? 'workspace stays' : `${count} workspaces stay`} on this PC as local copies. Nothing is sent or received until you connect again.`
          : 'Nothing is sent or received until you connect again.',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Cancel',
    });
    if (ok)
      await this.collab.disconnectRepo(repo.id);
  }

  private openPack(packId: string): void {
    const pack = this.services.findRegression(packId);
    this.collab.openTarget('regression', packId, pack?.name);
  }
}

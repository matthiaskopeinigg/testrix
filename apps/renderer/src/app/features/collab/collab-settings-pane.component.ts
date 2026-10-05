import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { defaultCollabIdentity, type CollabRepoSummary } from '@testrix/contracts';
import { TxButtonComponent, TxCheckComponent, TxInputComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { CollabStore, repoStatusLine } from './collab.store';

/**
 * Settings → Collab: who your commits come from, presence and run sharing, and one
 * card per connected repository with its branch, pause, token, and disconnect.
 */
@Component({
  selector: 'tx-collab-settings-pane',
  standalone: true,
  imports: [TxButtonComponent, TxCheckComponent, TxInputComponent],
  templateUrl: './collab-settings-pane.component.html',
  styleUrl: './collab-settings-pane.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabSettingsPaneComponent {
  readonly collab = inject(CollabStore);
  private readonly confirm = inject(ConfirmDialogService);

  readonly nameDraft = signal<string | null>(null);
  readonly emailDraft = signal<string | null>(null);
  private readonly branchDrafts = signal<Readonly<Record<string, string>>>({});

  readonly name = computed(() => this.nameDraft() ?? this.collab.status().identity.name);
  readonly email = computed(() => {
    if (this.emailDraft() !== null)
      return this.emailDraft() ?? '';
    const identity = this.collab.status().identity;
    return identity.email === defaultCollabIdentity(identity.name).email ? '' : identity.email;
  });

  isBranchDirty(repo: CollabRepoSummary): boolean {
    const draft = this.branchDrafts()[repo.id];
    return Boolean(draft !== undefined && draft.trim() && draft.trim() !== repo.branch);
  }

  statusLine(repo: CollabRepoSummary): string {
    return repoStatusLine(repo);
  }

  onPcCount(repo: CollabRepoSummary): number {
    return repo.workspaces.filter((entry) => entry.localId !== null).length;
  }

  branchFor(repo: CollabRepoSummary): string {
    return this.branchDrafts()[repo.id] ?? repo.branch;
  }

  setBranchDraft(repoId: string, value: string): void {
    this.branchDrafts.update((drafts) => ({ ...drafts, [repoId]: value }));
  }

  async saveIdentity(): Promise<void> {
    const name = this.name().trim();
    const email = this.email().trim();
    const current = this.collab.status().identity;
    if (!name || (name === current.name && email === current.email))
      return;
    await this.collab.setIdentity(name, email || undefined);
    this.nameDraft.set(null);
    this.emailDraft.set(null);
  }

  async saveBranch(repo: CollabRepoSummary): Promise<void> {
    const next = this.branchFor(repo).trim();
    if (!next || next === repo.branch)
      return;
    await this.collab.setBranch(next, repo.id);
    this.branchDrafts.update(({ [repo.id]: _saved, ...rest }) => rest);
  }

  handleBranchBlur(repo: CollabRepoSummary, event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next))
      return;
    void this.saveBranch(repo);
  }

  async togglePause(repo: CollabRepoSummary, paused: boolean): Promise<void> {
    if (paused !== (repo.sync === 'paused'))
      await this.collab.pauseOrResume(repo.id);
  }

  async toggleInvisible(invisible: boolean): Promise<void> {
    await this.collab.setPresenceMode(invisible ? 'offline' : 'active');
  }

  async disconnect(repo: CollabRepoSummary): Promise<void> {
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
}

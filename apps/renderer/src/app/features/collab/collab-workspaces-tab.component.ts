import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollabRepoSummary, CollabRepoWorkspace } from '@testrix/contracts';
import { TxButtonComponent, TxHintComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { WorkspacesStore } from '../workspaces/workspaces.store';
import { CollabStore } from './collab.store';

/**
 * Workspaces tab of the Collab dock: which of the repository's workspaces are on this
 * PC, which could be added, and which local workspaces could be published into it.
 */
@Component({
  selector: 'tx-collab-workspaces-tab',
  standalone: true,
  imports: [TxButtonComponent, TxHintComponent],
  templateUrl: './collab-workspaces-tab.component.html',
  styleUrl: './collab-workspaces-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabWorkspacesTabComponent {
  readonly collab = inject(CollabStore);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly confirm = inject(ConfirmDialogService);

  readonly repo = input.required<CollabRepoSummary>();
  readonly menuFor = signal<string | null>(null);

  readonly activeId = computed(() => this.workspaces.activeId());
  readonly onPc = computed(() => this.repo().workspaces.filter((entry) => entry.localId !== null));
  readonly notOnPc = computed(() => this.repo().workspaces.filter((entry) => entry.localId === null));

  toggleMenu(remoteId: string): void {
    this.menuFor.update((current) => (current === remoteId ? null : remoteId));
  }

  async add(entry: CollabRepoWorkspace): Promise<void> {
    await this.collab.addWorkspaces(this.repo().id, [entry.remoteId]);
  }

  async publish(workspaceId: string, name: string): Promise<void> {
    const repo = this.repo();
    const ok = await this.confirm.ask({
      title: `Publish ${name} to ${repo.repoName}`,
      body: 'Everyone with access to the repository can add it and see its saved requests, flows, and environments. Secret values stay on this PC.',
      confirmLabel: 'Publish',
      cancelLabel: 'Cancel',
    });
    if (ok)
      await this.collab.publishWorkspace(repo.id, workspaceId);
  }

  async removeFromPc(entry: CollabRepoWorkspace): Promise<void> {
    this.menuFor.set(null);
    if (!entry.localId)
      return;
    const ok = await this.confirm.ask({
      title: `Remove ${entry.name} from this PC`,
      body: 'The repository and your teammates keep it. History, cookies, and secret values saved on this PC for it are deleted.',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
    });
    if (ok)
      await this.collab.removeFromPc(entry.localId);
  }

  async removeFromRepo(entry: CollabRepoWorkspace): Promise<void> {
    this.menuFor.set(null);
    const repo = this.repo();
    const ok = await this.confirm.ask({
      title: `Remove ${entry.name} from ${repo.repoName}`,
      body: 'It stops syncing for everyone. Each PC that had it keeps a local copy.',
      confirmLabel: 'Remove for everyone',
      cancelLabel: 'Cancel',
    });
    if (ok)
      await this.collab.removeFromRepo(repo.id, entry.remoteId);
  }
}

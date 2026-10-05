import { OverlayModule, type ConnectedPosition, type CdkOverlayOrigin } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { workspaceDisplayName, type CollabSyncState, type Workspace } from '@testrix/contracts';
import { lockOverlayWindowDrag, playLeaveThen, TxHintComponent, TxSpinnerComponent, unlockOverlayWindowDrag } from '@testrix/ui';

import { SessionPersistenceService } from '../core/session-persistence.service';
import { ShellStateService } from '../core/shell-state.service';
import { CollabStore } from '../features/collab/collab.store';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';

@Component({
  selector: 'tx-workspace-switcher',
  standalone: true,
  imports: [OverlayModule, TxHintComponent, TxSpinnerComponent],
  templateUrl: './workspace-switcher.component.html',
  styleUrl: './workspace-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceSwitcherComponent {
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);
  readonly collab = inject(CollabStore);
  readonly shared = computed(() => this.workspaces.active()?.kind === 'shared');
  readonly hintDetail = computed(() => {
    if (!this.shared())
      return 'Collections and environments on this PC';
    if (this.collab.status().state === 'offline')
      return 'Offline — saved on this PC';
    return this.collab.statusLine();
  });

  readonly items = this.workspaces.items;

  /** Workspaces on this PC first, then one group per connected repository. */
  readonly groups = computed<readonly SwitcherGroup[]>(() => {
    const repos = this.collab.repos();
    const repoIds = new Set(repos.map((repo) => repo.id));
    const items = this.items();
    const local = items.filter((item) => !item.collab || !repoIds.has(item.collab.repoId));
    const groups: SwitcherGroup[] = local.length > 0
      ? [{ id: 'local', label: 'This PC', state: null, items: local, addRepoId: null }]
      : [];
    for (const repo of repos) {
      const linked = items.filter((item) => item.collab?.repoId === repo.id);
      const hasMore = repo.workspaces.some((entry) => !entry.localId);
      if (linked.length === 0 && !hasMore)
        continue;
      groups.push({
        id: repo.id,
        label: repo.repoName,
        state: repo.state,
        items: linked,
        addRepoId: hasMore ? repo.id : null,
      });
    }
    return groups;
  });
  readonly showGroupHeads = computed(() => this.collab.repos().length > 0);
  readonly activeId = computed(() => this.workspaces.active()?.id ?? '');
  readonly activeName = computed(() => {
    const active = this.workspaces.active();
    return active ? this.workspaceLabel(active) : 'Workspace';
  });
  readonly managerOpen = this.shell.workspaceManagerOpen;
  readonly open = signal(false);
  private closing = false;
  readonly triggerWidth = signal(220);
  readonly listId = 'tx-workspace-switcher-list';

  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  constructor() {
    effect((onCleanup) => {
      if (!this.open())
        return;
      lockOverlayWindowDrag();
      onCleanup(unlockOverlayWindowDrag);
    });
  }

  handleToggle(origin: CdkOverlayOrigin): void {
    if (this.open()) {
      this.close();
      return;
    }
    const el = origin.elementRef.nativeElement as HTMLElement;
    this.triggerWidth.set(Math.max(240, Math.ceil(el.getBoundingClientRect().width)));
    this.closing = false;
    this.open.set(true);
  }

  handleOutside(): void {
    this.close();
  }

  handleKeydown(event: KeyboardEvent, origin: CdkOverlayOrigin): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && !this.open()) {
      event.preventDefault();
      this.handleToggle(origin);
    }
  }

  handleManage(): void {
    this.close();
    this.shell.openWorkspaceManager();
  }

  handleCollab(): void {
    this.close();
    if (this.shared())
      this.collab.openDock();
    else
      this.collab.openConnect();
  }

  handleAddFrom(repoId: string): void {
    this.close();
    this.collab.openAddFromRepo(repoId);
  }

  async handleSelect(id: string): Promise<void> {
    this.close();
    const snapshot = await this.workspaces.switchTo(id);
    if (snapshot) {
      this.shell.playScene();
      this.session.applyActiveWorkspace();
    }
  }

  workspaceLabel(item: Workspace): string {
    return workspaceDisplayName(item);
  }

  private close(): void {
    if (!this.open() || this.closing)
      return;
    this.closing = true;
    const menu = document.getElementById(this.listId);
    playLeaveThen(menu instanceof HTMLElement ? menu : null, () => {
      this.closing = false;
      this.open.set(false);
    });
  }
}

interface SwitcherGroup {
  readonly id: string;
  readonly label: string;
  readonly state: CollabSyncState | null;
  readonly items: readonly Workspace[];
  readonly addRepoId: string | null;
}

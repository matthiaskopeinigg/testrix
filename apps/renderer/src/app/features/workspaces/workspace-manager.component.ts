import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  canDeleteWorkspace,
  workspaceDisplayName,
  type Workspace,
} from '@testrix/contracts';
import {
  TxButtonComponent,
  TxDraggableDirective,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  TxSelectComponent,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
  type TxSelectOption,
} from '@testrix/ui';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollabStore } from '../collab/collab.store';
import { WorkspaceManagerDndService } from './workspace-manager-dnd.service';
import { WorkspacesStore } from './workspaces.store';

type WorkspaceDraft = { readonly kind: 'create' };

const NEW_REPOSITORY = '__new';

@Component({
  selector: 'tx-workspace-manager',
  standalone: true,
  imports: [
    TxOverlayComponent,
    TxButtonComponent,
    TxDraggableDirective,
    TxHintComponent,
    TxInputComponent,
    TxSelectComponent,
  ],
  providers: [WorkspaceManagerDndService],
  templateUrl: './workspace-manager.component.html',
  styleUrl: './workspace-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class WorkspaceManagerComponent {
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);
  private readonly desktop = inject(DesktopApiService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly collab = inject(CollabStore);
  private readonly injector = inject(Injector);
  readonly dnd = inject(WorkspaceManagerDndService);

  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  readonly closed = output<void>();

  readonly items = this.workspaces.items;
  readonly activeId = computed(() => this.workspaces.active()?.id ?? '');
  readonly canDelete = computed(() => canDeleteWorkspace(this.items()));
  readonly draft = signal<WorkspaceDraft | null>(null);
  readonly draftValue = signal('');
  readonly busy = signal(false);
  readonly editId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly titleId = 'workspace-manager-title';
  readonly editTitleId = 'workspace-editor-title';

  readonly editItem = computed(() => {
    const id = this.editId();
    if (!id)
      return null;
    return this.items().find((item) => item.id === id) ?? null;
  });

  readonly overlayTitleId = computed(() => (this.editItem() ? this.editTitleId : this.titleId));

  /** Repository the workspace being edited lives in, if any. */
  readonly editRepo = computed(() => {
    const item = this.editItem();
    return item ? this.collab.repoForWorkspace(item.id) : null;
  });

  readonly publishRepoDraft = signal<string | null>(null);
  readonly publishRepoOptions = computed<readonly TxSelectOption[]>(() => [
    ...this.collab.repos().map((repo) => ({ value: repo.id, label: repo.repoName })),
    { value: NEW_REPOSITORY, label: 'New repository…' },
  ]);
  readonly publishRepoId = computed(() => this.publishRepoDraft() ?? this.collab.repos()[0]?.id ?? NEW_REPOSITORY);

  readonly renameDirty = computed(() => {
    const item = this.editItem();
    if (!item)
      return false;
    const next = this.renameValue().trim();
    return next.length > 0 && next !== item.name;
  });

  constructor() {
    effect(() => {
      const list = this.listRef()?.nativeElement ?? null;
      this.dnd.registerSurface(list, list);
    });
    effect(() => {
      const draft = this.draft();
      if (!draft)
        return;
      afterNextRender(
        () => {
          document.getElementById('workspace-new-name')?.focus();
        },
        { injector: this.injector },
      );
    });
    effect(() => {
      const item = this.editItem();
      if (!item)
        return;
      afterNextRender(
        () => {
          document.getElementById('workspace-edit-name')?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  handleDragStarted(event: TxDragStartEvent<Workspace>): void {
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<Workspace>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<Workspace>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  isJustMoved(id: string): boolean {
    return this.dnd.lastMovedId() === id;
  }

  isDragging(id: string): boolean {
    return this.dnd.isDragging(id);
  }

  handleRowKey(event: KeyboardEvent, item: Workspace): void {
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    this.openEditor(item);
  }

  handleClose(): void {
    this.draft.set(null);
    this.closeEditor();
    this.closed.emit();
  }

  handleOverlayClose(): void {
    if (this.editItem()) {
      this.closeEditor();
      return;
    }
    this.handleClose();
  }

  openEditor(item: Workspace): void {
    this.draft.set(null);
    this.editId.set(item.id);
    this.renameValue.set(item.name);
  }

  closeEditor(): void {
    this.editId.set(null);
    this.renameValue.set('');
    this.busy.set(false);
  }

  startCreate(): void {
    this.closeEditor();
    this.draft.set({ kind: 'create' });
    this.draftValue.set('');
  }

  handleDraftInput(value: string): void {
    this.draftValue.set(value);
  }

  handleRenameInput(value: string): void {
    this.renameValue.set(value);
  }

  cancelDraft(): void {
    this.draft.set(null);
    this.draftValue.set('');
  }

  async commitCreate(): Promise<void> {
    const draft = this.draft();
    if (!draft)
      return;
    const name = this.draftValue().trim();
    this.draft.set(null);
    await this.workspaces.create(name || 'Workspace');
    this.shell.playScene();
    this.session.applyActiveWorkspace();
  }

  handleDraftKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitCreate();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelDraft();
    }
  }

  handleRenameKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.saveRename();
    }
  }

  async saveRename(): Promise<void> {
    const item = this.editItem();
    if (!item || this.busy())
      return;
    const name = this.renameValue().trim();
    if (!name || name === item.name)
      return;
    this.busy.set(true);
    try {
      await this.workspaces.rename(item.id, name);
    } finally {
      this.busy.set(false);
    }
  }

  async handleDelete(): Promise<void> {
    const item = this.editItem();
    if (!item || !this.canDelete() || this.busy())
      return;
    const repo = this.editRepo();
    const ok = await this.confirm.ask({
      title: repo ? 'Remove workspace from this PC' : 'Delete workspace',
      body: repo
        ? `${workspaceDisplayName(item)} is removed from this PC. ${repo.repoName} and your teammates keep it.`
        : `This removes ${workspaceDisplayName(item)} and its collections and environments from this PC.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok)
      return;
    this.busy.set(true);
    try {
      const snapshot = await this.desktop.api.workspaces.delete(item.id);
      this.workspaces.acceptSnapshot(snapshot);
      this.shell.playScene();
      this.session.applyActiveWorkspace();
      this.closeEditor();
    } finally {
      this.busy.set(false);
    }
  }

  workspaceLabel(item: Workspace): string {
    return workspaceDisplayName(item);
  }

  async removeFromPc(): Promise<void> {
    const item = this.editItem();
    const repo = this.editRepo();
    if (!item || !repo || this.busy())
      return;
    const ok = await this.confirm.ask({
      title: `Remove ${workspaceDisplayName(item)} from this PC`,
      body: `${repo.repoName} and your teammates keep it. You can add it back from the Collab panel.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
    });
    if (!ok)
      return;
    this.busy.set(true);
    try {
      await this.collab.removeFromPc(item.id);
      this.closeEditor();
    } finally {
      this.busy.set(false);
    }
  }

  async publishToRepo(): Promise<void> {
    const item = this.editItem();
    if (!item || this.editRepo() || this.busy())
      return;
    const repoId = this.publishRepoId();
    if (repoId === NEW_REPOSITORY) {
      this.collab.openConnect(item.id);
      this.closed.emit();
      return;
    }
    const repo = this.collab.repoById(repoId);
    const ok = await this.confirm.ask({
      title: `Publish ${workspaceDisplayName(item)} to ${repo?.repoName ?? 'the repository'}`,
      body: 'Everyone with access to the repository can add it. Secret values stay on this PC.',
      confirmLabel: 'Publish',
      cancelLabel: 'Cancel',
    });
    if (!ok)
      return;
    this.busy.set(true);
    try {
      await this.collab.publishWorkspace(repoId, item.id);
    } finally {
      this.busy.set(false);
    }
  }
}

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';
import { canDeleteWorkspace, isDefaultWorkspace, workspaceDisplayName, type Workspace } from '@testrix/contracts';
import {
  TxButtonComponent,
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
} from '@testrix/ui';

import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { WorkspacesStore } from './workspaces.store';

type WorkspaceDraft = { readonly kind: 'create' } | { readonly kind: 'rename'; readonly id: string };

@Component({
  selector: 'tx-workspace-manager',
  standalone: true,
  imports: [TxOverlayComponent, TxButtonComponent, TxHintComponent, TxInputComponent],
  templateUrl: './workspace-manager.component.html',
  styleUrl: './workspace-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class WorkspaceManagerComponent {
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);
  private readonly injector = inject(Injector);

  readonly closed = output<void>();

  readonly items = computed(() => {
    const list = this.workspaces.items();
    const fallback = list.find((item) => isDefaultWorkspace(item));
    if (!fallback) {
      return list;
    }
    return [fallback, ...list.filter((item) => !isDefaultWorkspace(item))];
  });
  readonly activeId = computed(() => this.workspaces.active()?.id ?? '');
  readonly canDelete = computed(() => canDeleteWorkspace(this.items()));
  readonly draft = signal<WorkspaceDraft | null>(null);
  readonly draftValue = signal('');
  readonly titleId = 'workspace-manager-title';

  constructor() {
    effect(() => {
      const draft = this.draft();
      if (!draft)
        return;
      afterNextRender(
        () => {
          const id = draft.kind === 'create' ? 'workspace-new-name' : `workspace-rename-${draft.id}`;
          document.getElementById(id)?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  handleClose(): void {
    this.draft.set(null);
    this.closed.emit();
  }

  startCreate(): void {
    this.draft.set({ kind: 'create' });
    this.draftValue.set('');
  }

  startRename(id: string, name: string): void {
    this.draft.set({ kind: 'rename', id });
    this.draftValue.set(name);
  }

  handleDraftInput(value: string): void {
    this.draftValue.set(value);
  }

  cancelDraft(): void {
    this.draft.set(null);
    this.draftValue.set('');
  }

  async commitDraft(): Promise<void> {
    const draft = this.draft();
    if (!draft)
      return;
    const name = this.draftValue().trim();
    this.draft.set(null);
    if (draft.kind === 'create') {
      await this.workspaces.create(name || 'Workspace');
      this.shell.playScene();
      this.session.applyActiveWorkspace();
      return;
    }
    if (!name)
      return;
    await this.workspaces.rename(draft.id, name);
  }

  handleDraftKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitDraft();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelDraft();
    }
  }

  async handleSwitch(id: string): Promise<void> {
    if (this.draft())
      return;
    const snapshot = await this.workspaces.switchTo(id);
    if (snapshot) {
      this.shell.playScene();
      this.session.applyActiveWorkspace();
    }
  }

  async handleDuplicate(id: string): Promise<void> {
    await this.workspaces.duplicate(id);
    this.shell.playScene();
    this.session.applyActiveWorkspace();
  }

  async handleDelete(id: string): Promise<void> {
    const snapshot = await this.workspaces.delete(id);
    if (snapshot) {
      this.shell.playScene();
      this.session.applyActiveWorkspace();
    }
  }

  isRenaming(id: string): boolean {
    const draft = this.draft();
    return draft?.kind === 'rename' && draft.id === id;
  }

  workspaceLabel(item: Workspace): string {
    return workspaceDisplayName(item);
  }
}

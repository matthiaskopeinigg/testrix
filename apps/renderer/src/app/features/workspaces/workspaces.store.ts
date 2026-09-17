import { Injectable, computed, inject, signal } from '@angular/core';
import {
  canDeleteWorkspace,
  resolveActiveWorkspace,
  type Workspace,
  type WorkspaceSnapshot,
  type WorkspacesFile,
} from '@testrix/contracts';

import { ConfirmDialogService } from '../../core/confirm-dialog.service';
import { DesktopApiService } from '../../core/desktop-api.service';

@Injectable({ providedIn: 'root' })
export class WorkspacesStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly confirm = inject(ConfirmDialogService);

  readonly items = signal<readonly Workspace[]>([]);
  readonly activeId = signal<string | null>(null);
  private persistEnabled = false;

  readonly active = computed(() => {
    const id = this.activeId();
    return this.items().find((item) => item.id === id) ?? this.items()[0] ?? null;
  });

  hydrate(file: WorkspacesFile): void {
    const resolved = resolveActiveWorkspace(file);
    this.items.set(file.items);
    this.activeId.set(resolved?.id ?? null);
    this.persistEnabled = true;
  }

  isActive(id: string): boolean {
    return this.activeId() === id;
  }

  async switchTo(id: string): Promise<WorkspaceSnapshot | null> {
    if (!this.persistEnabled || id === this.activeId()) {
      return null;
    }
    const snapshot = await this.desktop.api.workspaces.switch(id);
    this.applySnapshot(snapshot);
    return snapshot;
  }

  async create(name: string): Promise<WorkspaceSnapshot> {
    const snapshot = await this.desktop.api.workspaces.create(name);
    this.applySnapshot(snapshot);
    return snapshot;
  }

  async rename(id: string, name: string): Promise<void> {
    const next = await this.desktop.api.workspaces.rename(id, name);
    this.items.set(next.items);
    this.activeId.set(next.activeId);
    this.desktop.workspaces.set(next);
  }

  async duplicate(id: string): Promise<WorkspaceSnapshot> {
    const snapshot = await this.desktop.api.workspaces.duplicate(id);
    this.applySnapshot(snapshot);
    return snapshot;
  }

  async delete(id: string): Promise<WorkspaceSnapshot | null> {
    if (!canDeleteWorkspace(this.items())) {
      return null;
    }
    const item = this.items().find((entry) => entry.id === id);
    const ok = await this.confirm.ask({
      title: 'Delete workspace',
      body: item
        ? `This removes ${item.name} and its collections and environments from this PC.`
        : 'This removes the workspace and its collections and environments from this PC.',
      confirmLabel: 'Delete',
    });
    if (!ok) {
      return null;
    }
    const snapshot = await this.desktop.api.workspaces.delete(id);
    this.applySnapshot(snapshot);
    return snapshot;
  }

  private applySnapshot(snapshot: WorkspaceSnapshot): void {
    this.desktop.applySnapshot(snapshot);
    this.hydrate(snapshot.workspaces);
  }
}

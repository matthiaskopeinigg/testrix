import { Injectable, computed, inject, signal } from '@angular/core';

import type { EnvironmentDefinition, EnvironmentsFile } from '@shared/config';
import { createDefaultEnvironments } from '@shared/config';

import { fromTreeNodes, toTreeNodes } from '@app/features/shell/environments/environment-tree.adapter';
import {
  createEnvironmentFolder,
  createEnvironmentVariable,
  deleteEnvironmentNode,
  duplicateEnvironmentVariable,
  findEnvironmentNode,
  renameEnvironmentNode,
  setEnvironmentFolderDescription,
  updateEnvironmentVariable,
} from '@app/features/shell/environments/environment-tree.mutations';
import { cloneEnvironmentDefinition } from '@app/features/shell/environments/environment-clone.utils';
import { getEnvironmentDefinition } from '@app/features/shell/environments/environment-profile.utils';
import type { EnvironmentTreeNode } from '@app/features/shell/environments/environment-tree.types';

import { ElectronService } from '../electron/electron.service';
import { ErrorNotificationService } from '../errors/error-notification.service';

const BROWSER_STORAGE_KEY = 'testrix.environments.v1';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `env-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class EnvironmentsService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly environmentsState = signal<EnvironmentDefinition[]>([]);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly environments = computed(() => this.environmentsState());

  /** @deprecated Use {@link environments}. */
  readonly nodes = computed(() => this.environmentsState());

  async hydrate(): Promise<void> {
    const api = this.electron.bridge();

    if (!api || typeof api.config.getEnvironments !== 'function') {
      this.loadBrowserFallback();
      return;
    }

    try {
      const file = await api.config.getEnvironments();
      this.environmentsState.set(file.environments);
    } catch {
      this.environmentsState.set(createDefaultEnvironments().environments);
    }
  }

  saveEnvironments(environments: readonly EnvironmentDefinition[], immediate = false): void {
    this.environmentsState.set([...environments]);
    if (immediate) {
      void this.flushSave();
      return;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, 300);
  }

  saveScopeNodes(
    environmentId: string,
    scopeNodes: readonly EnvironmentTreeNode[],
    immediate = false,
  ): boolean {
    const environments = this.environmentsState();
    const index = environments.findIndex((environment) => environment.id === environmentId);
    if (index < 0) {
      return false;
    }

    const next = [...environments];
    next[index] = {
      ...next[index]!,
      nodes: fromTreeNodes(scopeNodes),
    };
    this.saveEnvironments(next, immediate);
    return true;
  }

  /** Clones an environment profile (variables/folders) with a new id and unique name. */
  cloneEnvironment(sourceId: string): string | null {
    const environments = this.environmentsState();
    const index = environments.findIndex((environment) => environment.id === sourceId);
    if (index < 0) {
      return null;
    }

    const source = environments[index]!;
    const sourceOrder = source.order ?? index * 10;
    const clone = cloneEnvironmentDefinition(
      source,
      environments.map((environment) => environment.name),
      newId(),
      sourceOrder + 1,
    );

    const next = [...environments];
    next.splice(index + 1, 0, clone);
    this.saveEnvironments(next);
    return clone.id;
  }

  createEnvironment(name = 'New environment'): string {
    const environments = this.environmentsState();
    const order =
      environments.length === 0
        ? 0
        : Math.max(...environments.map((environment) => environment.order ?? 0)) + 10;

    const environment: EnvironmentDefinition = {
      id: newId(),
      name,
      order,
      nodes: [],
    };

    this.saveEnvironments([...environments, environment]);
    return environment.id;
  }

  updateEnvironment(
    id: string,
    patch: { readonly name?: string; readonly description?: string },
  ): boolean {
    let found = false;
    const next = this.environmentsState().map((environment) => {
      if (environment.id !== id) {
        return environment;
      }
      found = true;
      return {
        ...environment,
        name: patch.name !== undefined ? patch.name.trim() || environment.name : environment.name,
        description:
          patch.description !== undefined ? patch.description.trim() || undefined : environment.description,
      };
    });
    if (!found) {
      return false;
    }
    this.saveEnvironments(next);
    return true;
  }

  createScopeFolder(environmentId: string, parentId: string | null, label?: string): string | null {
    const scope = this.scopeTreeNodes(environmentId);
    if (scope === null) {
      return null;
    }
    const result = createEnvironmentFolder(scope, parentId, label);
    if (!result) {
      return null;
    }
    this.saveScopeNodes(environmentId, result.nodes);
    return result.nodeId;
  }

  createScopeVariable(
    environmentId: string,
    parentId: string | null,
    key?: string,
  ): string | null {
    const scope = this.scopeTreeNodes(environmentId);
    if (scope === null) {
      return null;
    }
    const result = createEnvironmentVariable(scope, parentId, key);
    if (!result) {
      return null;
    }
    this.saveScopeNodes(environmentId, result.nodes);
    return result.nodeId;
  }

  /** @deprecated Use {@link createEnvironment}. */
  createFolder(label?: string): string | null {
    return this.createEnvironment(label ?? 'New environment');
  }

  /** @deprecated Use {@link createScopeVariable}. */
  createVariable(environmentId: string, parentId: string | null = null, key?: string): string | null {
    return this.createScopeVariable(environmentId, parentId, key);
  }

  renameNode(id: string, labelOrKey: string): boolean {
    const environmentId = this.findEnvironmentIdContainingNode(id);
    if (!environmentId) {
      return this.updateEnvironment(id, { name: labelOrKey });
    }

    const scope = this.scopeTreeNodes(environmentId);
    if (!scope) {
      return false;
    }
    const next = renameEnvironmentNode(scope, id, labelOrKey);
    if (!next) {
      return false;
    }
    return this.saveScopeNodes(environmentId, next);
  }

  setFolderDescription(id: string, description: string): boolean {
    const environmentId = this.findEnvironmentIdContainingNode(id);
    if (!environmentId) {
      return false;
    }
    const scope = this.scopeTreeNodes(environmentId);
    if (!scope) {
      return false;
    }
    const next = setEnvironmentFolderDescription(scope, id, description);
    if (!next) {
      return false;
    }
    return this.saveScopeNodes(environmentId, next);
  }

  updateVariable(
    id: string,
    patch: { readonly key?: string; readonly value?: string; readonly description?: string },
    immediate = false,
  ): boolean {
    const environmentId = this.findEnvironmentIdContainingNode(id);
    if (!environmentId) {
      return false;
    }
    const scope = this.scopeTreeNodes(environmentId);
    if (!scope) {
      return false;
    }
    const next = updateEnvironmentVariable(scope, id, patch);
    if (!next) {
      return false;
    }
    return this.saveScopeNodes(environmentId, next, immediate);
  }

  deleteNode(id: string): boolean {
    if (getEnvironmentDefinition(this.environmentsState(), id)) {
      const next = this.environmentsState().filter((environment) => environment.id !== id);
      if (next.length === this.environmentsState().length) {
        return false;
      }
      this.saveEnvironments(next);
      return true;
    }

    const environmentId = this.findEnvironmentIdContainingNode(id);
    if (!environmentId) {
      return false;
    }
    const scope = this.scopeTreeNodes(environmentId);
    if (!scope) {
      return false;
    }
    const next = deleteEnvironmentNode(scope, id);
    if (!next) {
      return false;
    }
    return this.saveScopeNodes(environmentId, next);
  }

  duplicateVariable(id: string): string | null {
    const environmentId = this.findEnvironmentIdContainingNode(id);
    if (!environmentId) {
      return null;
    }
    const scope = this.scopeTreeNodes(environmentId);
    if (!scope) {
      return null;
    }
    const result = duplicateEnvironmentVariable(scope, id);
    if (!result) {
      return null;
    }
    this.saveScopeNodes(environmentId, result.nodes);
    return result.nodeId;
  }

  private scopeTreeNodes(environmentId: string): EnvironmentTreeNode[] | null {
    const environment = getEnvironmentDefinition(this.environmentsState(), environmentId);
    if (!environment) {
      return null;
    }
    return toTreeNodes(environment.nodes);
  }

  private findEnvironmentIdContainingNode(nodeId: string): string | null {
    for (const environment of this.environmentsState()) {
      const scope = toTreeNodes(environment.nodes);
      if (findEnvironmentNode(scope, nodeId)) {
        return environment.id;
      }
    }
    return null;
  }

  /** Persists any debounced environment changes before profile switch. */
  async flushPending(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushSave();
  }

  private async flushSave(): Promise<void> {
    const file = this.buildFile();
    const api = this.electron.bridge();

    if (!api || typeof api.config.setEnvironments !== 'function') {
      try {
        localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(file));
      } catch {
        /* ignore quota errors in dev */
      }
      return;
    }

    try {
      await api.config.setEnvironments(file);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private buildFile(): EnvironmentsFile {
    const defaults = createDefaultEnvironments();
    return {
      schemaVersion: 1,
      meta: {
        ...defaults.meta,
        updatedAt: new Date().toISOString(),
      },
      environments: this.environmentsState(),
    };
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as EnvironmentsFile;
        this.environmentsState.set(parsed.environments ?? createDefaultEnvironments().environments);
        return;
      }
    } catch {
      /* use defaults */
    }
    this.environmentsState.set(createDefaultEnvironments().environments);
  }
}

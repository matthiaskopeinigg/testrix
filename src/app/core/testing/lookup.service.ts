import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultLookupsFile,
  createLookupDefinition,
  findLookup,
  lookupTabResourceId,
  parseLookupsFile,
  parseLookupTabResourceId,
  type LookupDefinition,
  type LookupRunResult,
  type LookupsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { newTestingId } from '@app/core/testing/testing-id';
import { runTestingHydrateOnce, type TestingHydrateOptions } from '@app/core/testing/testing-hydrate-once';

/**
 * Profile-local lookup playbooks (ticket identifiers → DB queries → results).
 */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<LookupsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly lookups = computed(() => this.fileState()?.lookups ?? []);

  /**
   * Loads lookups.json for the active profile.
   */
  async hydrate(options?: TestingHydrateOptions): Promise<void> {
    return runTestingHydrateOnce(
      () => (this.fileState()?.lookups.length ?? 0) > 0,
      this.hydrateInflight,
      async () => {
        const api = this.electron.bridge()?.testing;
        if (!api?.getLookups) {
          this.fileState.set(createDefaultLookupsFile());
          return;
        }
        try {
          this.fileState.set(parseLookupsFile(await api.getLookups()));
        } catch (error) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultLookupsFile());
        }
      },
      options,
    );
  }

  /**
   * Writes a pending debounce save so a profile switch does not land on the next folder.
   */
  async flushPending(): Promise<void> {
    if (this.saveTimer === null) {
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const file = this.fileState();
    if (!file) {
      return;
    }
    await this.flushSave(file);
  }

  /** Finds a lookup by id. */
  find(id: string): LookupDefinition | null {
    return findLookup(this.lookups(), id);
  }

  /** Workspace tab resource id for a lookup. */
  tabResourceId(id: string): string {
    return lookupTabResourceId(id);
  }

  /** Display label for a lookup workspace tab. */
  labelForResource(resourceId: string): string {
    const id = parseLookupTabResourceId(resourceId);
    if (!id) {
      return 'Lookup';
    }
    return this.find(id)?.name?.trim() || 'Lookup';
  }

  /** Creates a new lookup playbook and returns it. */
  createLookup(name = 'New lookup'): LookupDefinition {
    const lookup = createLookupDefinition(newTestingId(), name.trim() || 'New lookup');
    const file = this.fileState() ?? createDefaultLookupsFile();
    this.scheduleSave({ ...file, lookups: [...file.lookups, lookup] });
    return lookup;
  }

  /** Patches a lookup playbook. */
  patchLookup(id: string, patch: Partial<Omit<LookupDefinition, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    this.scheduleSave({
      ...file,
      lookups: file.lookups.map((lookup) => {
        if (lookup.id !== id) {
          return lookup;
        }
        return {
          ...lookup,
          ...patch,
          id: lookup.id,
          updatedAt: new Date().toISOString(),
        };
      }),
    });
  }

  /** Deletes a lookup playbook. */
  deleteLookup(id: string): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    this.scheduleSave({
      ...file,
      lookups: file.lookups.filter((lookup) => lookup.id !== id),
    });
  }

  /** Runs a lookup playbook in the main process. */
  async run(
    lookupId: string,
    payload: { readonly environmentId?: string | null; readonly inputs?: Readonly<Record<string, string>> },
  ): Promise<LookupRunResult | null> {
    const api = this.electron.bridge()?.testing;
    if (!api?.lookupRun) {
      return null;
    }
    try {
      return await api.lookupRun({
        lookupId,
        environmentId: payload.environmentId,
        inputs: payload.inputs ? { ...payload.inputs } : {},
      });
    } catch (error) {
      this.notifier.reportUnknown(error);
      return null;
    }
  }

  private scheduleSave(file: LookupsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave(file);
    }, 300);
  }

  private async flushSave(file: LookupsFile): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api?.setLookups) {
      return;
    }
    try {
      this.fileState.set(await api.setLookups(file));
    } catch (error) {
      this.notifier.reportUnknown(error);
    }
  }
}

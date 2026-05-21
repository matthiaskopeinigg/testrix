import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultRegressionsFile,
  regressionTabResourceId,
  regressionsFileSchema,
  type RegressionArtifact,
  type RegressionsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';
import { runTestingHydrateOnce } from './testing-hydrate-once';

const BROWSER_STORAGE_KEY = 'testrix.regressions.v1';

@Injectable({ providedIn: 'root' })
export class RegressionService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<RegressionsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };

  readonly items = computed(() => this.fileState()?.items ?? []);

  async hydrate(): Promise<void> {
    return runTestingHydrateOnce(
      () => this.fileState() !== null,
      this.hydrateInflight,
      async () => {
        const api = this.electron.bridge()?.testing;
        if (!api) {
          this.loadBrowserFallback();
          return;
        }
        try {
          this.fileState.set(regressionsFileSchema.parse(await api.getRegressions()));
        } catch (error: unknown) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultRegressionsFile());
        }
      },
    );
  }

  find(id: string): RegressionArtifact | null {
    return this.items().find((item) => item.id === id) ?? null;
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('rg:')) {
      return 'Regression';
    }
    return this.find(resourceId.slice(3))?.name ?? 'Regression';
  }

  add(name = 'New regression'): RegressionArtifact {
    const ts = new Date().toISOString();
    const item: RegressionArtifact = {
      id: newTestingId(),
      name,
      description: '',
      flowIds: [],
      runs: [],
      updatedAt: ts,
    };
    const file = this.fileState() ?? createDefaultRegressionsFile();
    this.scheduleSave({ ...file, items: [...file.items, item] });
    return item;
  }

  private scheduleSave(file: RegressionsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: RegressionsFile): Promise<void> {
    const parsed = regressionsFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(regressionsFileSchema.parse(await api.setRegressions(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(regressionsFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultRegressionsFile());
  }
}

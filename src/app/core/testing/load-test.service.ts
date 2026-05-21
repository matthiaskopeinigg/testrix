import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultLoadTestsFile,
  loadTestsFileSchema,
  loadTestTabResourceId,
  type LoadTestArtifact,
  type LoadTestTreeItem,
  type LoadTestsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';

const BROWSER_STORAGE_KEY = 'testrix.load-tests.v1';

function isArtifact(item: LoadTestTreeItem): item is LoadTestArtifact {
  return 'profile' in item;
}

@Injectable({ providedIn: 'root' })
export class LoadTestService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<LoadTestsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly items = computed(() => this.fileState()?.items ?? []);

  async hydrate(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.loadBrowserFallback();
      return;
    }
    try {
      this.fileState.set(loadTestsFileSchema.parse(await api.getLoadTests()));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.fileState.set(createDefaultLoadTestsFile());
    }
  }

  findArtifact(id: string): LoadTestArtifact | null {
    const walk = (list: readonly LoadTestTreeItem[]): LoadTestArtifact | null => {
      for (const item of list) {
        if (isArtifact(item) && item.id === id) {
          return item;
        }
        if (!isArtifact(item)) {
          const found = walk(item.children);
          if (found) {
            return found;
          }
        }
      }
      return null;
    };
    return walk(this.items());
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('lt:')) {
      return 'Load test';
    }
    return this.findArtifact(resourceId.slice(3))?.name ?? 'Load test';
  }

  addArtifact(name = 'New load test'): LoadTestArtifact {
    const ts = new Date().toISOString();
    const artifact: LoadTestArtifact = {
      id: newTestingId(),
      name,
      description: '',
      profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
      updatedAt: ts,
    };
    const file = this.fileState() ?? createDefaultLoadTestsFile();
    this.scheduleSave({ ...file, items: [...file.items, artifact] });
    return artifact;
  }

  tabResourceId(id: string): string {
    return loadTestTabResourceId(id);
  }

  private scheduleSave(file: LoadTestsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: LoadTestsFile): Promise<void> {
    const parsed = loadTestsFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(loadTestsFileSchema.parse(await api.setLoadTests(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(loadTestsFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultLoadTestsFile());
  }
}

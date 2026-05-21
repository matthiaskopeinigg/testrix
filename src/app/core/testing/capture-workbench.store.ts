import { Injectable, computed, inject, signal } from '@angular/core';

import {
  captureTabResourceId,
  captureFileSchema,
  createDefaultCaptureFile,
  type CaptureFile,
  type CaptureItem,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';

const BROWSER_STORAGE_KEY = 'testrix.capture.v1';

@Injectable({ providedIn: 'root' })
export class CaptureWorkbenchStore {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<CaptureFile | null>(null);
  private readonly runningState = signal(false);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly items = computed(() => this.fileState()?.items ?? []);
  readonly running = computed(() => this.runningState());

  async hydrate(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.loadBrowserFallback();
      return;
    }
    try {
      const [file, status] = await Promise.all([api.getCapture(), api.captureStatus()]);
      this.fileState.set(captureFileSchema.parse(file));
      this.runningState.set(status.running);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.fileState.set(createDefaultCaptureFile());
    }
  }

  find(id: string): CaptureItem | null {
    return this.items().find((i) => i.id === id) ?? null;
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('cap:')) {
      return 'Capture';
    }
    return this.find(resourceId.slice(4))?.name ?? 'Capture';
  }

  addItem(name = 'New capture'): CaptureItem {
    const ts = new Date().toISOString();
    const item: CaptureItem = { id: newTestingId(), name, startUrl: 'https://example.com', updatedAt: ts };
    const file = this.fileState() ?? createDefaultCaptureFile();
    this.scheduleSave({ ...file, items: [...file.items, item] });
    return item;
  }

  async start(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(true);
      return;
    }
    this.runningState.set((await api.captureStart()).running);
  }

  async stop(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(false);
      return;
    }
    this.runningState.set((await api.captureStop()).running);
  }

  private scheduleSave(file: CaptureFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: CaptureFile): Promise<void> {
    const parsed = captureFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(captureFileSchema.parse(await api.setCapture(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(captureFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultCaptureFile());
  }

  tabResourceId(id: string): string {
    return captureTabResourceId(id);
  }
}

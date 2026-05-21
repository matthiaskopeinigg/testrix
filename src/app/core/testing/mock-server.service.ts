import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultMockServerFile,
  mockServerFileSchema,
  mockServerTabResourceId,
  type MockEndpoint,
  type MockServerFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';

import { newTestingId } from './testing-id';

const BROWSER_STORAGE_KEY = 'testrix.mock-server.v1';

@Injectable({ providedIn: 'root' })
export class MockServerService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<MockServerFile | null>(null);
  private readonly runningState = signal(false);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly endpoints = computed(() => this.fileState()?.endpoints ?? []);
  readonly options = computed(() => this.fileState()?.options ?? createDefaultMockServerFile().options);
  readonly running = computed(() => this.runningState());

  async hydrate(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.loadBrowserFallback();
      return;
    }
    try {
      const [file, status] = await Promise.all([api.getMockServer(), api.mockStatus()]);
      this.fileState.set(mockServerFileSchema.parse(file));
      this.runningState.set(status.running);
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
      this.fileState.set(createDefaultMockServerFile());
    }
  }

  find(id: string): MockEndpoint | null {
    return this.endpoints().find((e) => e.id === id) ?? null;
  }

  labelForResource(resourceId: string): string {
    if (!resourceId.startsWith('ms:')) {
      return 'Mock server';
    }
    return this.find(resourceId.slice(3))?.name ?? 'Mock endpoint';
  }

  addEndpoint(name = 'New endpoint'): MockEndpoint {
    const ts = new Date().toISOString();
    const endpoint: MockEndpoint = {
      id: newTestingId(),
      name,
      method: 'GET',
      path: '/',
      statusCode: 200,
      body: '{}',
      latencyMs: 0,
      updatedAt: ts,
    };
    const file = this.fileState() ?? createDefaultMockServerFile();
    this.scheduleSave({ ...file, endpoints: [...file.endpoints, endpoint] });
    return endpoint;
  }

  async start(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(true);
      return;
    }
    const status = await api.mockStart();
    this.runningState.set(status.running);
  }

  async stop(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.runningState.set(false);
      return;
    }
    const status = await api.mockStop();
    this.runningState.set(status.running);
  }

  private scheduleSave(file: MockServerFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => void this.persist(file), 300);
  }

  private async persist(file: MockServerFile): Promise<void> {
    const parsed = mockServerFileSchema.parse(file);
    const api = this.electron.bridge()?.testing;
    if (!api) {
      localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(parsed));
      return;
    }
    try {
      this.fileState.set(mockServerFileSchema.parse(await api.setMockServer(parsed)));
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    }
  }

  private loadBrowserFallback(): void {
    try {
      const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
      if (raw) {
        this.fileState.set(mockServerFileSchema.parse(JSON.parse(raw)));
        return;
      }
    } catch {
      // ignore
    }
    this.fileState.set(createDefaultMockServerFile());
  }
}

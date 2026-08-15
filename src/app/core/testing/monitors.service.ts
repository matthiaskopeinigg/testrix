import { Injectable, computed, inject, signal } from '@angular/core';

import {
  computeNextMonitorRunAt,
  createDefaultMonitorsFile,
  parseMonitorsFile,
  type MonitorDefinition,
  type MonitorResult,
  type MonitorTargetKind,
  type MonitorsFile,
} from '@shared/testing';

import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { newTestingId } from '@app/core/testing/testing-id';
import { runTestingHydrateOnce } from '@app/core/testing/testing-hydrate-once';

/**
 * Profile-local cron monitors (run while Testrix is open).
 */
@Injectable({ providedIn: 'root' })
export class MonitorsService {
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);

  private readonly fileState = signal<MonitorsFile | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly hydrateInflight: { current: Promise<void> | null } = { current: null };
  private unsubResult: (() => void) | null = null;

  readonly pendingCron = signal('');

  readonly monitors = computed(() => this.fileState()?.monitors ?? []);
  readonly results = computed(() => this.fileState()?.results ?? []);

  async hydrate(): Promise<void> {
    return runTestingHydrateOnce(
      () => this.fileState() !== null,
      this.hydrateInflight,
      async () => {
        const api = this.electron.bridge()?.testing;
        if (!api?.getMonitors) {
          this.fileState.set(createDefaultMonitorsFile());
          return;
        }
        try {
          this.fileState.set(parseMonitorsFile(await api.getMonitors()));
        } catch (error) {
          this.notifier.reportUnknown(error);
          this.fileState.set(createDefaultMonitorsFile());
        }
        this.unsubResult?.();
        this.unsubResult = api.onMonitorResult?.((result) => this.applyResult(result)) ?? null;
      },
    );
  }

  setPendingCron(expression: string): void {
    this.pendingCron.set(expression.trim());
  }

  consumePendingCron(): string {
    const value = this.pendingCron();
    this.pendingCron.set('');
    return value;
  }

  createMonitor(input: {
    readonly name?: string;
    readonly cron?: string;
    readonly targetKind?: MonitorTargetKind;
    readonly targetId?: string;
    readonly environmentId?: string | null;
  } = {}): MonitorDefinition | null {
    const cron = (input.cron ?? this.pendingCron() ?? '* * * * *').trim() || '* * * * *';
    const targetId = input.targetId?.trim() ?? '';
    if (!targetId) {
      return null;
    }
    const monitor: MonitorDefinition = {
      id: newTestingId(),
      name: input.name?.trim() || 'New monitor',
      cron,
      enabled: true,
      targetKind: input.targetKind ?? 'request',
      targetId,
      environmentId: input.environmentId ?? null,
      nextRunAt: computeNextMonitorRunAt(cron) ?? undefined,
    };
    const file = this.fileState() ?? createDefaultMonitorsFile();
    this.scheduleSave({ ...file, monitors: [...file.monitors, monitor] });
    this.pendingCron.set('');
    return monitor;
  }

  patchMonitor(id: string, patch: Partial<Omit<MonitorDefinition, 'id'>>): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    this.scheduleSave({
      ...file,
      monitors: file.monitors.map((monitor) => {
        if (monitor.id !== id) {
          return monitor;
        }
        const next = { ...monitor, ...patch, id: monitor.id };
        if (patch.cron && patch.cron !== monitor.cron) {
          return { ...next, nextRunAt: computeNextMonitorRunAt(next.cron) ?? next.nextRunAt };
        }
        return next;
      }),
    });
  }

  deleteMonitor(id: string): void {
    const file = this.fileState();
    if (!file) {
      return;
    }
    this.scheduleSave({
      ...file,
      monitors: file.monitors.filter((monitor) => monitor.id !== id),
      results: file.results.filter((result) => result.monitorId !== id),
    });
  }

  async runNow(id: string): Promise<MonitorResult | null> {
    const api = this.electron.bridge()?.testing;
    if (!api?.monitorRunNow) {
      return null;
    }
    try {
      const result = await api.monitorRunNow(id);
      if (result) {
        this.applyResult(result);
      }
      return result;
    } catch (error) {
      this.notifier.reportUnknown(error);
      return null;
    }
  }

  private applyResult(result: MonitorResult): void {
    const file = this.fileState() ?? createDefaultMonitorsFile();
    const results = [result, ...file.results.filter((row) => row.id !== result.id)].slice(0, 100);
    this.fileState.set({ ...file, results });
  }

  private scheduleSave(file: MonitorsFile): void {
    this.fileState.set(file);
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave(file);
    }, 300);
  }

  private async flushSave(file: MonitorsFile): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api?.setMonitors) {
      return;
    }
    try {
      this.fileState.set(await api.setMonitors(file));
    } catch (error) {
      this.notifier.reportUnknown(error);
    }
  }
}

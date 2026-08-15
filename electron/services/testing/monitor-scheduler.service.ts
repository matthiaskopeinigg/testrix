import { Notification, app, type BrowserWindow } from 'electron';

import { buildOutgoingRequest } from '../../../shared/http/build-outgoing-request';
import { sendHttpRequestPayloadSchema } from '../../../shared/http/outgoing-request.schema';
import {
  computeNextMonitorRunAt,
  findLoadTestArtifactInTree,
  isMonitorDue,
  prependMonitorResult,
  type MonitorDefinition,
  type MonitorResult,
} from '../../../shared/testing';
import { loadTestEnvironmentIdOverride } from '../../../shared/testing/resolve-load-test-environment';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import { TestingChannels } from '../../ipc/channels/testing.channels';
import type { ConfigFileService } from '../config/config-file.service';
import { executeHttpRequest } from '../http/http-request-executor.service';
import type { TestingRuntimeService } from './testing-runtime.service';

const TICK_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newResultId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mon-${Date.now()}`;
}

/**
 * Fires enabled local cron monitors while Testrix is open.
 */
export class MonitorScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly inflight = new Set<string>();

  constructor(
    private readonly files: ConfigFileService,
    private readonly runtime: TestingRuntimeService,
    private readonly getMainWindow: () => BrowserWindow | null,
  ) {}

  /** Starts the periodic tick. Idempotent. */
  start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  /** Stops the periodic tick. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Runs one monitor immediately, ignoring cron due time. */
  async runNow(monitorId: string): Promise<MonitorResult | null> {
    const file = await this.files.readMonitors();
    const monitor = file.monitors.find((row) => row.id === monitorId);
    if (!monitor) {
      return null;
    }
    return this.executeMonitor(monitor);
  }

  private async tick(): Promise<void> {
    const file = await this.files.readMonitors();
    const now = new Date();
    for (const monitor of file.monitors) {
      if (this.inflight.has(monitor.id) || !isMonitorDue(monitor, now)) {
        continue;
      }
      void this.executeMonitor(monitor);
    }
  }

  private async executeMonitor(monitor: MonitorDefinition): Promise<MonitorResult> {
    this.inflight.add(monitor.id);
    const startedAt = new Date().toISOString();
    let result: MonitorResult;
    try {
      result = await this.runTarget(monitor, startedAt);
    } catch (error: unknown) {
      result = {
        id: newResultId(),
        monitorId: monitor.id,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: false,
        message: error instanceof Error ? error.message : 'Monitor failed',
      };
    } finally {
      this.inflight.delete(monitor.id);
    }

    const latest = await this.files.readMonitors();
    const nextRunAt = computeNextMonitorRunAt(monitor.cron, new Date()) ?? undefined;
    const monitors = latest.monitors.map((row) =>
      row.id === monitor.id ? { ...row, lastRunAt: result.finishedAt, nextRunAt } : row,
    );
    const saved = await this.files.saveMonitors({
      ...latest,
      monitors,
      results: prependMonitorResult(latest.results, result),
    });
    this.emitResult(result);
    if (!result.ok) {
      this.notifyFailure(monitor, result);
    }
    void saved;
    return result;
  }

  private async runTarget(monitor: MonitorDefinition, startedAt: string): Promise<MonitorResult> {
    if (monitor.targetKind === 'request') {
      return this.runRequest(monitor, startedAt);
    }
    if (monitor.targetKind === 'flow') {
      return this.runFlow(monitor, startedAt);
    }
    return this.runLoadTest(monitor, startedAt);
  }

  private async runRequest(monitor: MonitorDefinition, startedAt: string): Promise<MonitorResult> {
    const settings = await this.files.readSettings();
    const collections = await this.files.readCollections();
    const environments = await this.files.readEnvironments();
    const built = buildOutgoingRequest({
      requestId: monitor.targetId,
      nodes: collections.nodes,
      http: settings.http,
      environments,
      appVersion: app.getVersion?.() ?? '0.0.0',
      runScope: { runId: `monitor-${monitor.id}` },
      environmentVariableKeys: {
        useFolderPathInKeys: settings.environments.useFolderPathInKeys,
      },
      environmentIdOverride: loadTestEnvironmentIdOverride(monitor.environmentId),
    });
    if (!built) {
      return this.fail(monitor, startedAt, 'Collection request was not found.');
    }
    const payload = sendHttpRequestPayloadSchema.parse({
      ...built.outgoing,
      runScope: { runId: `monitor-${monitor.id}` },
    });
    const { snapshot } = await executeHttpRequest(payload);
    const ok = snapshot.status.ok && snapshot.status.code < 400;
    return {
      id: newResultId(),
      monitorId: monitor.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok,
      message: ok
        ? `${snapshot.status.code} ${snapshot.requestSummary.url}`
        : snapshot.meta?.errorMessage || `HTTP ${snapshot.status.code}`,
      statusCode: snapshot.status.code,
    };
  }

  private async runFlow(monitor: MonitorDefinition, startedAt: string): Promise<MonitorResult> {
    const override = loadTestEnvironmentIdOverride(monitor.environmentId);
    const run = await this.runtime.e2eExecuteFlow(monitor.targetId, undefined, {
      ...(override === undefined ? {} : { environmentIdOverride: override }),
    });
    return {
      id: newResultId(),
      monitorId: monitor.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: run.ok,
      message: run.message,
    };
  }

  private async runLoadTest(monitor: MonitorDefinition, startedAt: string): Promise<MonitorResult> {
    const loadTests = await this.files.readLoadTests();
    const artifact = findLoadTestArtifactInTree(loadTests.items, monitor.targetId);
    if (!artifact) {
      return this.fail(monitor, startedAt, 'Load test was not found.');
    }
    try {
      await this.runtime.loadTestStart({
        loadTestId: artifact.id,
        targetSource: artifact.targetSource,
        targetRequestId: artifact.targetRequestId,
        manualTarget: artifact.manualTarget,
        environmentId:
          monitor.environmentId === undefined || monitor.environmentId === null
            ? artifact.environmentId
            : monitor.environmentId,
        virtualUsers: artifact.profile.virtualUsers,
        durationSec: artifact.profile.durationSec,
        rampUpSec: artifact.profile.rampUpSec,
      });
    } catch (error: unknown) {
      if (error instanceof TestrixError && error.code === ErrorCodes.LOAD_TEST_ALREADY_RUNNING) {
        return this.fail(monitor, startedAt, 'Load test already running.');
      }
      throw error;
    }

    const deadline =
      Date.now() + (artifact.profile.durationSec + artifact.profile.rampUpSec + 30) * 1000;
    while (this.runtime.loadTestStatus(artifact.id).running && Date.now() < deadline) {
      await sleep(500);
    }
    const metrics = this.runtime.loadTestMetrics(artifact.id);
    const ok = !metrics.running && metrics.failedRequests === 0;
    return {
      id: newResultId(),
      monitorId: monitor.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok,
      message: ok
        ? `${metrics.totalRequests} requests, ${metrics.successRatePercent.toFixed(1)}% success`
        : metrics.running
          ? 'Load test did not finish before the monitor timeout.'
          : `${metrics.failedRequests} failed of ${metrics.totalRequests}`,
    };
  }

  private fail(monitor: MonitorDefinition, startedAt: string, message: string): MonitorResult {
    return {
      id: newResultId(),
      monitorId: monitor.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      message,
    };
  }

  private emitResult(result: MonitorResult): void {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    window.webContents.send(TestingChannels.monitorResult, result);
  }

  private notifyFailure(monitor: MonitorDefinition, result: MonitorResult): void {
    if (!Notification.isSupported()) {
      return;
    }
    new Notification({
      title: 'Testrix monitor failed',
      body: `${monitor.name}: ${result.message || 'Check the Monitors log.'}`,
    }).show();
  }
}

let schedulerInstance: MonitorScheduler | null = null;

/** Returns the process-wide monitor scheduler, creating it on first use. */
export function getMonitorScheduler(
  files: ConfigFileService,
  runtime: TestingRuntimeService,
  getMainWindow: () => BrowserWindow | null,
): MonitorScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new MonitorScheduler(files, runtime, getMainWindow);
  }
  return schedulerInstance;
}

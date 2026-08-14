import type { WebContents } from 'electron';

import { TestrixError, ErrorCodes } from '../../../shared/errors';
import {
  appendRegressionMetricsSample,
  buildRegressionMetricsSample,
  createIdleRegressionRunMetrics,
  createStartingRegressionRunMetrics,
  finalizeRegressionRun,
  isRegressionArtifact,
  migrateRegressionsFile,
  migrateTestSuitesFile,
  regressionProfileSchema,
  regressionFlowResultSchema,
  regressionStartOptionsSchema,
  REGRESSION_MAX_PARALLELISM,
  REGRESSION_RUN_SAMPLES_MAX,
  TEST_SUITE_ROOT_ID,
  resolveRegressionFlowIds,
  type RegressionFlowResult,
  type RegressionFlowTimelineEntry,
  type RegressionProfile,
  type RegressionRun,
  type RegressionRunMetrics,
  type RegressionStartOptions,
  type RegressionThresholds,
} from '../../../shared/testing';

import { TestingChannels } from '../../ipc/channels/testing.channels';
import type { ConfigFileService } from '../config/config-file.service';
import { E2eRunnerService } from './e2e-runner.service';
import {
  TestSuiteFlowExecutor,
  type TestSuiteFlowExecuteOptions,
  type TestSuiteFlowRunResult,
} from './test-suite-flow-executor.service';

import type { RegressionValidationFailure } from '../../../shared/testing/regression-run.schema';

import { randomUUID } from 'node:crypto';

const METRICS_TICK_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FlowWorker {
  readonly executor: TestSuiteFlowExecutor;
  readonly e2eRunner: E2eRunnerService;
}

function createFlowWorker(): FlowWorker {
  const e2eRunner = new E2eRunnerService();
  const executor = new TestSuiteFlowExecutor();
  executor.setE2eRunner(e2eRunner);
  return { executor, e2eRunner };
}

function buildFlowResult(
  flowId: string,
  flowName: string,
  result: TestSuiteFlowRunResult,
  attemptCount: number,
  includeCaptures: boolean,
  includeErrors: boolean,
): RegressionFlowResult {
  let passedStepCount = 0;
  let failedStepCount = 0;
  let skippedStepCount = 0;
  for (const status of Object.values(result.stepStatuses)) {
    if (status === 'passed') {
      passedStepCount += 1;
    } else if (status === 'failed') {
      failedStepCount += 1;
    } else if (status === 'skipped') {
      skippedStepCount += 1;
    }
  }

  const status =
    result.message === 'Run cancelled.'
      ? 'cancelled'
      : result.ok
        ? 'passed'
        : 'failed';

  return regressionFlowResultSchema.parse({
    flowId,
    flowName,
    status,
    durationMs: result.durationMs,
    message: result.message,
    attemptCount,
    stepStatuses: result.stepStatuses,
    stepDurations: result.stepDurations,
    stepErrors: includeErrors ? result.stepErrors : undefined,
    stepCaptures: includeCaptures ? result.stepCaptures : undefined,
    passedStepCount,
    failedStepCount,
    skippedStepCount,
    validationFailures: buildValidationFailures(result),
  });
}

function buildValidationFailures(result: TestSuiteFlowRunResult): RegressionValidationFailure[] {
  const failures: RegressionValidationFailure[] = [];
  for (const [stepId, error] of Object.entries(result.stepErrors)) {
    if (result.stepStatuses[stepId] !== 'failed') {
      continue;
    }
    failures.push({
      stepId,
      stepName: stepId,
      label: 'Validation',
      operatorLabel: 'failed',
      expected: '',
      actual: error,
    });
  }
  return failures;
}

/**
 * Executes regression batches with optional parallel flow workers.
 */
export class RegressionRunner {
  private running = false;
  private cancelled = false;
  private metrics: RegressionRunMetrics = createIdleRegressionRunMetrics();
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private flowDurationsMs: number[] = [];
  private flowResults: RegressionFlowResult[] = [];
  private flowTimeline: RegressionFlowTimelineEntry[] = [];
  private runStartedAt = 0;
  private runId = '';
  private regressionId = '';
  private profile: RegressionProfile = regressionProfileSchema.parse({});
  private thresholds: RegressionThresholds = { acceptancePercent: 100 };
  private scheduledFlowIds: string[] = [];
  private readonly activeWorkers = new Set<FlowWorker>();

  snapshot(): RegressionRunMetrics {
    return this.metrics;
  }

  cancel(): RegressionRunMetrics {
    if (!this.running) {
      return this.metrics;
    }
    this.cancelled = true;
    for (const worker of this.activeWorkers) {
      worker.executor.cancel();
    }
    this.stopMetricsTick();
    this.metrics = { ...this.metrics, running: false };
    return this.metrics;
  }

  async start(
    options: unknown,
    files: ConfigFileService,
    sender?: WebContents,
  ): Promise<{ readonly metrics: RegressionRunMetrics; readonly run: RegressionRun }> {
    if (this.running) {
      throw new TestrixError(ErrorCodes.REGRESSION_ALREADY_RUNNING, 'A regression is already running.');
    }

    const parsed = regressionStartOptionsSchema.parse(options ?? {});
    const regressions = migrateRegressionsFile(await files.readRegressions());
    const artifact = findRegressionArtifact(regressions.items, parsed.regressionId);
    if (!artifact) {
      throw new TestrixError(ErrorCodes.REGRESSION_NOT_FOUND, 'Regression not found.');
    }
    if (artifact.archivedAt) {
      throw new TestrixError(ErrorCodes.REGRESSION_ARCHIVED, 'Regression is archived.');
    }

    this.profile = regressionProfileSchema.parse({
      ...artifact.profile,
      ...parsed.profileOverride,
    });
    this.thresholds = artifact.thresholds;
    this.regressionId = artifact.id;
    this.runId = randomUUID();
    this.runStartedAt = Date.now();
    this.flowResults = [];
    this.flowTimeline = [];
    this.flowDurationsMs = [];
    this.cancelled = false;
    this.running = true;
    this.activeWorkers.clear();

    const flowIds = resolveRegressionFlowIds(artifact, this.profile, {
      flowIdsOverride: parsed.flowIdsOverride,
      selectedFlowIds: parsed.selectedFlowIds,
    });

    if (flowIds.length === 0) {
      throw new TestrixError(ErrorCodes.REGRESSION_NOT_FOUND, 'No flows to run for the selected scope.');
    }

    this.scheduledFlowIds = [...flowIds];

    if (this.profile.shuffleOrder) {
      shuffleInPlace(flowIds);
    }

    this.metrics = createStartingRegressionRunMetrics(
      this.regressionId,
      this.runId,
      flowIds.length,
      this.thresholds.acceptancePercent,
    );
    this.startMetricsTick(sender);

    const executeOptions: TestSuiteFlowExecuteOptions = {
      environmentIdOverride: this.profile.environmentId ?? undefined,
      e2eShowWindowOverride: this.profile.e2eShowWindowOverride,
      e2eKeepWindowOpenOverride: this.profile.e2eKeepWindowOpenOverride,
    };

    try {
      if (this.profile.executionMode === 'parallel') {
        await this.runParallel(flowIds, files, sender, executeOptions);
      } else {
        await this.runSequential(flowIds, files, sender, executeOptions);
      }
      await this.recordRemainingAsSkipped(flowIds, files, sender);
    } finally {
      this.stopMetricsTick();
      this.running = false;
    }

    const run = finalizeRegressionRun({
      runId: this.runId,
      startedAt: new Date(this.runStartedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      cancelled: this.cancelled,
      profile: this.profile,
      thresholds: this.thresholds,
      flowResults: this.flowResults,
      flowTimeline: this.flowTimeline,
      samples: this.metrics.samples,
    });

    this.metrics = {
      ...this.metrics,
      running: false,
      completed: this.flowResults.length,
      passed: run.passedCount,
      failed: run.failedCount,
      skipped: run.skippedCount,
      passRatePercent: run.summary?.passRatePercent ?? 0,
    };

    sender?.send(TestingChannels.regressionRunProgress, {
      regressionId: this.regressionId,
      runId: this.runId,
      done: true,
      run,
    });

    return { metrics: this.metrics, run };
  }

  private effectiveParallelism(flowCount: number): number {
    if (this.profile.allFlowsAtOnce) {
      return Math.min(flowCount, REGRESSION_MAX_PARALLELISM);
    }
    return Math.min(this.profile.maxParallelism, flowCount);
  }

  private async runSequential(
    flowIds: readonly string[],
    files: ConfigFileService,
    sender: WebContents | undefined,
    executeOptions: TestSuiteFlowExecuteOptions,
  ): Promise<void> {
    const worker = createFlowWorker();
    this.activeWorkers.add(worker);
    try {
      for (const flowId of flowIds) {
        if (this.cancelled) {
          break;
        }
        await this.runSingleFlow(flowId, 0, worker, files, sender, executeOptions);
        if (this.profile.delayBetweenFlowsMs > 0) {
          await sleep(this.profile.delayBetweenFlowsMs);
        }
        if (this.shouldStopAfterFailure()) {
          break;
        }
      }
    } finally {
      this.activeWorkers.delete(worker);
      await worker.e2eRunner.closeRunner().catch(() => undefined);
    }
  }

  private async runParallel(
    flowIds: readonly string[],
    files: ConfigFileService,
    sender: WebContents | undefined,
    executeOptions: TestSuiteFlowExecuteOptions,
  ): Promise<void> {
    const poolSize = this.effectiveParallelism(flowIds.length);
    const workers = Array.from({ length: poolSize }, () => createFlowWorker());
    for (const worker of workers) {
      this.activeWorkers.add(worker);
    }
    let nextIndex = 0;

    const runNext = async (slot: number): Promise<void> => {
      while (!this.cancelled) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= flowIds.length) {
          return;
        }
        if (this.shouldStopAfterFailure()) {
          return;
        }
        const flowId = flowIds[index]!;
        await this.runSingleFlow(flowId, slot, workers[slot]!, files, sender, executeOptions);
        if (this.profile.delayBetweenFlowsMs > 0) {
          await sleep(this.profile.delayBetweenFlowsMs);
        }
      }
    };

    try {
      await Promise.all(workers.map((_, slot) => runNext(slot)));
    } finally {
      for (const worker of workers) {
        this.activeWorkers.delete(worker);
      }
      await Promise.all(workers.map((w) => w.e2eRunner.closeRunner().catch(() => undefined)));
    }
  }

  private shouldStopAfterFailure(): boolean {
    if (!this.profile.stopOnFirstFailure) {
      return false;
    }
    return this.flowResults.some((r) => r.status === 'failed');
  }

  private async runSingleFlow(
    flowId: string,
    workerSlot: number,
    worker: FlowWorker,
    files: ConfigFileService,
    sender: WebContents | undefined,
    executeOptions: TestSuiteFlowExecuteOptions,
  ): Promise<void> {
    if (this.cancelled) {
      return;
    }

    const flowName = await resolveFlowName(flowId, files);
    const offsetMs = Date.now() - this.runStartedAt;
    const timelineEntry: RegressionFlowTimelineEntry = {
      flowId,
      flowName,
      workerSlot,
      startedAtOffsetMs: offsetMs,
      durationMs: 0,
      status: 'running',
    };
    this.flowTimeline.push(timelineEntry);
    this.emitProgress(sender, { flowTimeline: [...this.flowTimeline] });

    let attempt = 0;
    let result: TestSuiteFlowRunResult | null = null;
    const maxAttempts = 1 + this.profile.retryFailedFlows;

    while (attempt < maxAttempts && !this.cancelled) {
      attempt += 1;
      result = await worker.executor.executeFlow(
        flowId,
        files,
        (event) => {
          sender?.send(TestingChannels.regressionRunProgress, {
            regressionId: this.regressionId,
            runId: this.runId,
            flowId: event.flowId,
            stepStatuses: event.stepStatuses,
            flowTimeline: [...this.flowTimeline],
          });
        },
        executeOptions,
      );
      if (result.ok) {
        break;
      }
    }

    if (!result) {
      if (this.cancelled) {
        const entryIndex = this.flowTimeline.indexOf(timelineEntry);
        if (entryIndex >= 0) {
          this.flowTimeline[entryIndex] = {
            ...timelineEntry,
            durationMs: 0,
            status: 'cancelled',
          };
        }
      }
      return;
    }

    const flowResult = buildFlowResult(
      flowId,
      flowName,
      result,
      attempt,
      this.profile.includeStepCaptures,
      this.profile.includeStepErrors,
    );
    this.flowResults.push(flowResult);
    this.flowDurationsMs.push(result.durationMs);

    const entryIndex = this.flowTimeline.indexOf(timelineEntry);
    if (entryIndex >= 0) {
      this.flowTimeline[entryIndex] = {
        ...timelineEntry,
        durationMs: result.durationMs,
        status: flowResult.status,
      };
    }

    this.metrics = {
      ...this.metrics,
      completed: this.flowResults.length,
      passed: this.flowResults.filter((r) => r.status === 'passed').length,
      failed: this.flowResults.filter((r) => r.status === 'failed').length,
      passRatePercent:
        this.flowResults.length > 0
          ? (this.flowResults.filter((r) => r.status === 'passed').length /
              this.flowResults.filter((r) => r.status === 'passed' || r.status === 'failed').length) *
            100
          : 0,
    };

    sender?.send(TestingChannels.regressionRunProgress, {
      regressionId: this.regressionId,
      runId: this.runId,
      flowId,
      flowResult,
      flowTimeline: [...this.flowTimeline],
      done: false,
    });
  }

  private async recordRemainingAsSkipped(
    flowIds: readonly string[],
    files: ConfigFileService,
    sender: WebContents | undefined,
  ): Promise<void> {
    const ranIds = new Set(this.flowResults.map((r) => r.flowId));
    const remaining = flowIds.filter((id) => !ranIds.has(id));
    if (remaining.length === 0) {
      return;
    }
    const shouldSkip =
      this.cancelled ||
      (this.profile.stopOnFirstFailure && this.flowResults.some((r) => r.status === 'failed'));
    if (!shouldSkip) {
      return;
    }
    for (const flowId of remaining) {
      const flowName = await resolveFlowName(flowId, files);
      const skippedResult = regressionFlowResultSchema.parse({
        flowId,
        flowName,
        status: 'skipped',
        durationMs: 0,
        message: this.cancelled ? 'Run cancelled.' : 'Skipped after failure.',
        attemptCount: 1,
        passedStepCount: 0,
        failedStepCount: 0,
        skippedStepCount: 0,
        validationFailures: [],
      });
      this.flowResults.push(skippedResult);
      this.flowTimeline.push({
        flowId,
        flowName,
        workerSlot: 0,
        startedAtOffsetMs: Date.now() - this.runStartedAt,
        durationMs: 0,
        status: 'skipped',
      });
    }
    if (sender && this.flowTimeline.length > 0) {
      this.emitProgress(sender, { flowTimeline: [...this.flowTimeline] });
    }
  }

  private emitProgress(
    sender: WebContents | undefined,
    extra: Record<string, unknown>,
  ): void {
    sender?.send(TestingChannels.regressionRunProgress, {
      regressionId: this.regressionId,
      runId: this.runId,
      ...extra,
    });
  }

  private startMetricsTick(sender?: WebContents): void {
    this.metricsTimer = setInterval(() => {
      const elapsedSec = (Date.now() - this.runStartedAt) / 1000;
      const sample = buildRegressionMetricsSample(
        elapsedSec,
        this.metrics.passed,
        this.metrics.failed,
        this.metrics.skipped,
        Math.min(this.effectiveParallelism(this.scheduledFlowIds.length), Math.max(1, this.metrics.activeParallelism)),
        this.flowDurationsMs,
      );
      this.metrics = {
        ...this.metrics,
        elapsedSec,
        passRatePercent: sample.passRatePercent,
        samples: appendRegressionMetricsSample(
          this.metrics.samples,
          sample,
          REGRESSION_RUN_SAMPLES_MAX,
        ),
      };
      sender?.send(TestingChannels.regressionMetrics, this.metrics);
    }, METRICS_TICK_MS);
  }

  private stopMetricsTick(): void {
    if (this.metricsTimer !== null) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function findRegressionArtifact(
  items: readonly import('../../../shared/testing').RegressionTreeItem[],
  id: string,
): import('../../../shared/testing').RegressionArtifact | null {
  for (const item of items) {
    if (isRegressionArtifact(item) && item.id === id) {
      return item;
    }
    if (!isRegressionArtifact(item)) {
      const found = findRegressionArtifact(item.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

async function resolveFlowName(flowId: string, files: ConfigFileService): Promise<string> {
  const raw = await files.readTestSuites();
  const file = migrateTestSuitesFile(raw);
  const root = file.suites.find((s) => s.id === TEST_SUITE_ROOT_ID) ?? file.suites[0];
  if (!root) {
    return flowId;
  }
  const walk = (items: readonly import('../../../shared/testing').TestSuiteTreeItem[]): string | null => {
    for (const item of items) {
      if ('nodes' in item && item.id === flowId) {
        return item.name;
      }
      if (!('nodes' in item)) {
        const found = walk(item.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  return walk(root.flows) ?? flowId;
}

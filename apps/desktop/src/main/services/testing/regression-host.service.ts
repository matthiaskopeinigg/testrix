import {
  REGRESSION_RUN_HISTORY_MAX,
  REGRESSION_RUN_SAMPLES_MAX,
  clampRegressionParallelism,
  environmentVariableMap,
  findServiceNode,
  newRegressionRunId,
  regressionDurationStats,
  type FlowArtifactFields,
  flowHasDeviceNodes,
  type RegressionEntryStatus,
  type RegressionFlowTimelineEntry,
  type RegressionMetricsSample,
  type RegressionPackEntry,
  type RegressionRunEntry,
  type RegressionRunOptions,
  type RegressionRunRecord,
  type RegressionSuiteEvent,
  type RegressionSuiteStatus,
  type RegressionTimelineStatus,
  type RegressionsFile,
  type ServiceTreeNode,
} from '@testrix/contracts';

import type { ConfigStore } from '../config.service';
import type { FlowHost } from './flow-host.service';

type FlowArtifact = Extract<ServiceTreeNode<FlowArtifactFields>, { kind: 'artifact' }>;

function sleep(ms: number, shouldStop?: () => boolean): Promise<void> {
  if (ms <= 0 || shouldStop?.())
    return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      if (shouldStop?.() || Date.now() - started >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(50, Math.max(0, ms - (Date.now() - started))));
    };
    setTimeout(tick, Math.min(50, ms));
  });
}

function shuffleJobs(jobs: readonly ExpandedJob[]): ExpandedJob[] {
  const next = [...jobs];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = next[index]!;
    next[index] = next[swap]!;
    next[swap] = current;
  }
  return next;
}

interface ExpandedJob {
  readonly flowId: string;
  readonly flowName: string;
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly flow: FlowArtifact | null;
  readonly key: string;
}

/**
 * Runs a regression pack (flows + scenarios) and persists structured suite results.
 */
export class RegressionHost {
  private abort = false;
  private runningId: string | null = null;

  constructor(
    private readonly store: ConfigStore,
    private readonly flows: FlowHost,
  ) {}

  isRunning(regressionId?: string): boolean {
    if (!this.runningId)
      return false;
    return regressionId ? this.runningId === regressionId : true;
  }

  cancel(): void {
    if (!this.runningId)
      return;
    this.abort = true;
    this.flows.cancel();
  }

  async run(
    regressionId: string,
    onEvent: ((event: RegressionSuiteEvent) => void) | null,
    options: RegressionRunOptions = {},
  ): Promise<{ ok: boolean; error: string | null; run: RegressionRunRecord | null }> {
    this.abort = false;
    this.runningId = regressionId;
    const node = findServiceNode(this.store.regressions.items, regressionId);
    if (!node || node.kind !== 'artifact') {
      this.runningId = null;
      return { ok: false, error: 'Regression not found', run: null };
    }

    const started = Date.now();
    const at = new Date(started).toISOString();
    const envId = node.environmentId ?? this.store.environments.activeId;
    const env = this.store.environments.items.find((item) => item.id === envId);
    const envVars = env ? environmentVariableMap(env.variables) : {};
    const onlyKeys = options.onlyKeys?.length ? new Set(options.onlyKeys) : null;

    const jobs: ExpandedJob[] = [];
    for (const packEntry of node.entries.filter((entry) => entry.enabled)) {
      for (const job of this.expandEntry(packEntry)) {
        if (onlyKeys && !onlyKeys.has(job.key) && !onlyKeys.has(`${job.flowId}::`))
          continue;
        jobs.push(job);
      }
    }

    const runEntries: RegressionRunEntry[] = [];
    const flowTimeline: RegressionFlowTimelineEntry[] = [];
    const samples: RegressionMetricsSample[] = [];
    let cancelled = false;
    let completed = 0;
    let activeCount = 0;

    const buildSample = (): RegressionMetricsSample => {
      const passedSoFar = runEntries.filter((item) => item.status === 'ok').length;
      const failedSoFar = runEntries.filter((item) => item.status === 'error').length;
      const skippedSoFar = runEntries.filter(
        (item) => item.status === 'skipped' || item.status === 'cancelled',
      ).length;
      const decided = passedSoFar + failedSoFar;
      const stats = regressionDurationStats(runEntries.map((item) => item.durationMs));
      return {
        elapsedSec: (Date.now() - started) / 1000,
        completedFlows: runEntries.length,
        passedFlows: passedSoFar,
        failedFlows: failedSoFar,
        skippedFlows: skippedSoFar,
        activeParallelism: activeCount,
        passRatePercent: decided > 0 ? (passedSoFar / decided) * 100 : 0,
        avgFlowDurationMs: stats.avgMs,
      };
    };

    const pushSample = (): void => {
      samples.push(buildSample());
      if (samples.length > REGRESSION_RUN_SAMPLES_MAX)
        samples.shift();
    };

    const emit = (
      phase: RegressionSuiteEvent['phase'],
      message: string,
      entry?: RegressionSuiteEvent['entry'],
    ): void => {
      const sample = samples[samples.length - 1];
      onEvent?.({
        regressionId,
        phase,
        message,
        total: jobs.length,
        completed,
        ...(entry ? { entry } : {}),
        passed: runEntries.filter((item) => item.status === 'ok').length,
        failed: runEntries.filter((item) => item.status === 'error').length,
        skipped: runEntries.filter(
          (item) => item.status === 'skipped' || item.status === 'cancelled',
        ).length,
        elapsedSec: sample?.elapsedSec ?? (Date.now() - started) / 1000,
        activeParallelism: activeCount,
        samples: [...samples],
        flowTimeline: [...flowTimeline],
      });
    };

    pushSample();

    const ordered = node.shuffleOrder ? shuffleJobs(jobs) : jobs;
    const hasDeviceJobs = ordered.some(
      (job) => job.flow !== null && flowHasDeviceNodes(job.flow.scenarios),
    );
    const workerCount =
      node.executionMode === 'sequential'
        ? 1
        : Math.min(clampRegressionParallelism(node.maxParallelism), Math.max(1, ordered.length));

    const startMessage =
      hasDeviceJobs && node.executionMode === 'parallel'
        ? `Running ${jobs.length} entr${jobs.length === 1 ? 'y' : 'ies'} (device flows sequential)`
        : `Running ${jobs.length} entr${jobs.length === 1 ? 'y' : 'ies'}`;

    onEvent?.({
      regressionId,
      phase: 'suite-start',
      message: startMessage,
      total: jobs.length,
      completed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      elapsedSec: 0,
      activeParallelism: 0,
      samples: [...samples],
      flowTimeline: [],
    });

    // Push a live sample roughly twice a second so charts animate even mid-flow.
    const ticker = setInterval(() => {
      if (this.runningId !== regressionId)
        return;
      const nowOffset = Date.now() - started;
      for (let index = 0; index < flowTimeline.length; index += 1) {
        const entry = flowTimeline[index];
        if (!entry || entry.status !== 'running')
          continue;
        flowTimeline[index] = {
          ...entry,
          durationMs: Math.max(0, nowOffset - entry.startedAtOffsetMs),
        };
      }
      pushSample();
      emit('progress', `${completed}/${jobs.length}`);
    }, 500);

    const retries = Math.max(0, Math.min(3, node.retryFailed));
    const delayMs = Math.max(0, node.delayBetweenFlowsMs);
    let cursor = 0;
    let stopScheduling = false;
    // Shared emulator — only one device flow may own DeviceLane at a time.
    let deviceGate: Promise<void> = Promise.resolve();

    const withDeviceGate = async <T>(run: () => Promise<T>): Promise<T> => {
      const previous = deviceGate;
      let release!: () => void;
      deviceGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await run();
      } finally {
        release();
      }
    };

    const runJob = async (job: ExpandedJob, slot: number): Promise<void> => {
      const timelineIndex = flowTimeline.length;
      flowTimeline.push({
        flowId: job.flowId,
        flowName: job.flowName,
        scenarioName: job.scenarioName,
        workerSlot: slot,
        startedAtOffsetMs: Math.max(0, Date.now() - started),
        durationMs: 0,
        status: 'running',
      });
      activeCount += 1;
      pushSample();
      emit('entry-start', `${job.flowName} · ${job.scenarioName}`, {
        flowId: job.flowId,
        flowName: job.flowName,
        scenarioId: job.scenarioId,
        scenarioName: job.scenarioName,
        status: 'running',
        durationMs: 0,
        error: null,
      });

      const stepStarted = Date.now();
      let status = 'ok' as RegressionEntryStatus;
      let error = null as string | null;
      const attempts = retries + 1;
      const usesDevice = job.flow !== null && flowHasDeviceNodes(job.flow.scenarios);

      const executeAttempts = async (): Promise<void> => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (this.abort) {
            status = 'cancelled';
            error = 'Cancelled';
            cancelled = true;
            break;
          }
          status = 'ok';
          error = null;
          if (!job.flow) {
            status = 'error';
            error = job.scenarioName.startsWith('(') ? job.scenarioName.slice(1, -1) : 'Flow not found';
          } else {
            const result = await this.flows.runInBatch(
              job.flowId,
              job.flow,
              this.store.databases,
              envVars,
              job.scenarioId,
            );
            if (this.abort || result.error === 'cancelled') {
              status = 'cancelled';
              error = 'Cancelled';
              cancelled = true;
            } else if (!result.ok) {
              status = 'error';
              error = result.error ?? 'failed';
            }
          }
          if (status !== 'error' || attempt === attempts - 1)
            break;
        }
      };

      if (usesDevice)
        await withDeviceGate(executeAttempts);
      else
        await executeAttempts();

      const durationMs = Date.now() - stepStarted;
      const runEntry: RegressionRunEntry = {
        flowId: job.flowId,
        flowName: job.flowName,
        scenarioId: job.scenarioId,
        scenarioName: job.scenarioName,
        status,
        durationMs,
        error,
      };
      runEntries.push(runEntry);
      completed += 1;
      activeCount = Math.max(0, activeCount - 1);
      flowTimeline[timelineIndex] = {
        ...flowTimeline[timelineIndex]!,
        durationMs,
        status: status as RegressionTimelineStatus,
      };
      pushSample();
      emit(
        'entry-end',
        status === 'ok'
          ? `${job.flowName} · ${job.scenarioName} ok`
          : `${job.flowName} · ${job.scenarioName}: ${error ?? status}`,
        { ...runEntry, status },
      );
      if (status === 'error' && node.stopOnFirstFailure)
        stopScheduling = true;
    };

    const worker = async (slot: number): Promise<void> => {
      for (;;) {
        if (this.abort || stopScheduling) {
          if (this.abort)
            cancelled = true;
          return;
        }
        const index = cursor;
        cursor += 1;
        if (index >= ordered.length)
          return;
        const job = ordered[index];
        if (!job)
          return;
        await runJob(job, slot);
        if (delayMs > 0 && !this.abort && !stopScheduling)
          await sleep(delayMs, () => this.abort || stopScheduling);
      }
    };

    try {
      await this.flows.beginBatch();
      await Promise.all(Array.from({ length: workerCount }, (_, slot) => worker(slot)));
    } finally {
      clearInterval(ticker);
      this.flows.endBatch();
    }

    if (this.abort)
      cancelled = true;

    const nowOffset = Date.now() - started;
    for (let index = 0; index < flowTimeline.length; index += 1) {
      const entry = flowTimeline[index];
      if (!entry || entry.status !== 'running')
        continue;
      flowTimeline[index] = {
        ...entry,
        durationMs: Math.max(0, nowOffset - entry.startedAtOffsetMs),
        status: 'cancelled',
      };
    }

    const passed = runEntries.filter((item) => item.status === 'ok').length;
    const failed = runEntries.filter((item) => item.status === 'error').length;
    const skipped = runEntries.filter(
      (item) => item.status === 'skipped' || item.status === 'cancelled',
    ).length;
    const decided = passed + failed;
    const errorRate = decided > 0 ? failed / decided : 0;
    const threshold = Math.max(0, Math.min(1, node.maxErrorRate));
    const thresholdFailed = decided > 0 && errorRate > threshold;
    const anyFailWhenZero = threshold === 0 && failed > 0;

    let status: RegressionSuiteStatus = 'passed';
    let suiteError: string | null = null;
    if (cancelled) {
      status = 'cancelled';
      suiteError = 'Cancelled';
    } else if (anyFailWhenZero || thresholdFailed) {
      status = 'failed';
      suiteError =
        threshold === 0
          ? `${failed} entr${failed === 1 ? 'y' : 'ies'} failed`
          : `Error rate ${(errorRate * 100).toFixed(0)}% exceeds ${(threshold * 100).toFixed(0)}%`;
    }

    const decidedDurations = runEntries
      .filter((item) => item.status === 'ok' || item.status === 'error')
      .map((item) => item.durationMs);
    const durationStats = regressionDurationStats(decidedDurations);

    const run: RegressionRunRecord = {
      id: newRegressionRunId(),
      at,
      durationMs: Date.now() - started,
      status,
      passed,
      failed,
      skipped,
      environmentId: envId,
      release: node.release,
      error: suiteError,
      entries: runEntries,
      samples,
      flowTimeline,
      avgDurationMs: durationStats.avgMs,
      p95DurationMs: durationStats.p95Ms,
    };

    const nextItems = this.store.regressions.items.map((item) => {
      if (item.id !== regressionId || item.kind !== 'artifact')
        return item;
      return { ...item, runs: [run, ...item.runs].slice(0, REGRESSION_RUN_HISTORY_MAX), updatedAt: run.at };
    }) as RegressionsFile['items'];
    await this.store.patchRegressions({ items: nextItems });

    this.runningId = null;
    onEvent?.({
      regressionId,
      phase: 'suite-done',
      message: suiteError ?? `Passed ${passed}, failed ${failed}`,
      total: jobs.length,
      completed,
      passed,
      failed,
      skipped,
      elapsedSec: run.durationMs / 1000,
      activeParallelism: 0,
      samples,
      flowTimeline,
    });

    return { ok: status === 'passed', error: suiteError, run };
  }

  private expandEntry(entry: RegressionPackEntry): ExpandedJob[] {
    const flow = findServiceNode(this.store.flows.items, entry.flowId);
    if (!flow || flow.kind !== 'artifact') {
      return [
        {
          flowId: entry.flowId,
          flowName: entry.flowId,
          scenarioId: entry.scenarioId ?? '',
          scenarioName: '(missing flow)',
          flow: null,
          key: `${entry.flowId}::${entry.scenarioId ?? ''}`,
        },
      ];
    }

    const scenarios = entry.scenarioId
      ? flow.scenarios.filter((scenario) => scenario.id === entry.scenarioId)
      : flow.scenarios.filter((scenario) => scenario.enabled);

    if (scenarios.length === 0) {
      return [
        {
          flowId: flow.id,
          flowName: flow.name,
          scenarioId: entry.scenarioId ?? '',
          scenarioName: entry.scenarioId ? '(scenario missing)' : '(no enabled scenarios)',
          flow: null,
          key: `${flow.id}::${entry.scenarioId ?? ''}`,
        },
      ];
    }

    return scenarios.map((scenario) => ({
      flowId: flow.id,
      flowName: flow.name,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      flow,
      key: `${flow.id}::${scenario.id}`,
    }));
  }
}

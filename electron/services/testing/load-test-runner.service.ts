import { buildOutgoingRequest } from '../../../shared/http/build-outgoing-request';
import type { SendHttpRequestPayload } from '../../../shared/http/outgoing-request.schema';
import type { HttpResponseSnapshot } from '../../../shared/http/outgoing-request.schema';
import { sendHttpRequestPayloadSchema } from '../../../shared/http/outgoing-request.schema';
import { TestrixError, ErrorCodes } from '../../../shared/errors';
import { computeLatencySnapshot } from '../../../shared/testing/load-test-metrics-aggregate';
import {
  createIdleLoadTestRunMetrics,
  loadTestRunMetricsSchema,
  loadTestStartOptionsSchema,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
} from '../../../shared/testing/load-test-run.schema';

import type { ConfigFileService } from '../config/config-file.service';
import { executeHttpRequest } from '../http/http-request-executor.service';

const METRICS_TICK_MS = 500;
const MAX_LATENCY_WINDOW = 2_000;
const MAX_SAMPLES = 120;
const VU_IDLE_MS = 25;

function newRequestId(baseId: string, vuIndex: number, iteration: number): string {
  return `${baseId}-lt-${vuIndex}-${iteration}`;
}

function activeVirtualUsers(
  elapsedSec: number,
  virtualUsers: number,
  rampUpSec: number,
): number {
  if (rampUpSec <= 0) {
    return virtualUsers;
  }
  const progress = Math.min(1, elapsedSec / Math.max(rampUpSec, 0.001));
  return Math.max(1, Math.round(virtualUsers * progress));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes real HTTP load against a collection request with virtual users and ramp-up.
 */
export class LoadTestRunner {
  private cancelled = false;
  private running = false;
  private startedAt = 0;
  private options: LoadTestStartOptions = loadTestStartOptionsSchema.parse({
    targetRequestId: 'missing',
    virtualUsers: 1,
    durationSec: 1,
    rampUpSec: 0,
  });

  private metrics: LoadTestRunMetrics = createIdleLoadTestRunMetrics();
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private vuTasks: Promise<void>[] = [];
  private basePayload: SendHttpRequestPayload | null = null;

  private totalRequests = 0;
  private failedRequests = 0;
  private requestsInWindow = 0;
  private windowStartedAt = 0;
  private latenciesMs: number[] = [];
  /** Returns the latest metrics snapshot. */
  snapshot(): LoadTestRunMetrics {
    return this.metrics;
  }

  /** Starts an HTTP load test run against the target collection request. */
  async start(options: unknown, files: ConfigFileService, appVersion: string): Promise<LoadTestRunMetrics> {
    if (this.running) {
      throw new TestrixError(ErrorCodes.LOAD_TEST_ALREADY_RUNNING, 'A load test is already running.');
    }

    const parsed = loadTestStartOptionsSchema.parse(options ?? {});
    const [collections, settings, environments] = await Promise.all([
      files.readCollections(),
      files.readSettings(),
      files.readEnvironments(),
    ]);

    const built = buildOutgoingRequest({
      requestId: parsed.targetRequestId,
      nodes: collections.items,
      http: settings.http,
      environments,
      appVersion,
      runScope: { runId: `load-test-${Date.now()}` },
    });

    if (!built) {
      throw new TestrixError(
        ErrorCodes.LOAD_TEST_TARGET_NOT_FOUND,
        'Target request was not found in collections.',
      );
    }

    const payloadCheck = sendHttpRequestPayloadSchema.safeParse({
      ...built.outgoing,
      runScope: { runId: `load-test-${Date.now()}` },
    });
    if (!payloadCheck.success) {
      throw new TestrixError(
        ErrorCodes.CONFIG_VALIDATION_FAILED,
        'Target request could not be prepared for load testing.',
      );
    }

    this.resetState();
    this.options = parsed;
    this.basePayload = payloadCheck.data;
    this.running = true;
    this.cancelled = false;
    this.startedAt = Date.now();
    this.windowStartedAt = this.startedAt;

    this.metrics = loadTestRunMetricsSchema.parse({
      running: true,
      elapsedSec: 0,
      virtualUsers: 0,
      totalRequests: 0,
      failedRequests: 0,
      successRatePercent: 100,
      requestsPerSec: 0,
      peakRequestsPerSec: 0,
      errorRatePercent: 0,
      latencyMs: { avg: 0, p50: 0, p95: 0, p99: 0 },
      samples: [],
    });

    this.metricsTimer = setInterval(() => this.tickMetrics(), METRICS_TICK_MS);

    this.vuTasks = Array.from({ length: parsed.virtualUsers }, (_, vuIndex) =>
      this.runVirtualUser(vuIndex),
    );

    void Promise.all(this.vuTasks).then(() => {
      if (!this.cancelled) {
        this.finishRun();
      }
    });

    return this.snapshot();
  }

  /** Cancels the active run and returns final metrics. */
  cancel(): LoadTestRunMetrics {
    this.cancelled = true;
    this.finishRun();
    return this.snapshot();
  }

  private resetState(): void {
    this.stopMetricsTimer();
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.requestsInWindow = 0;
    this.latenciesMs = [];
    this.vuTasks = [];
    this.basePayload = null;
  }

  private async runVirtualUser(vuIndex: number): Promise<void> {
    const payload = this.basePayload;
    if (!payload) {
      return;
    }

    let iteration = 0;

    while (!this.cancelled) {
      const elapsedSec = (Date.now() - this.startedAt) / 1000;
      if (elapsedSec >= this.options.durationSec) {
        break;
      }

      if (vuIndex >= activeVirtualUsers(elapsedSec, this.options.virtualUsers, this.options.rampUpSec)) {
        await sleep(VU_IDLE_MS);
        continue;
      }

      const requestPayload = sendHttpRequestPayloadSchema.parse({
        ...payload,
        requestId: newRequestId(payload.requestId, vuIndex, iteration++),
        runScope: {
          runId: payload.runScope?.runId ?? `load-test-${this.startedAt}`,
          index: iteration,
        },
      });

      const started = performance.now();
      try {
        const snapshot = await executeHttpRequest(requestPayload);
        this.recordOutcome(snapshot, performance.now() - started);
      } catch {
        this.recordFailure(performance.now() - started);
      }
    }
  }

  private recordOutcome(snapshot: HttpResponseSnapshot, latencyMs: number): void {
    this.totalRequests += 1;
    this.requestsInWindow += 1;
    if (!snapshot.status.ok) {
      this.failedRequests += 1;
    }
    this.pushLatency(latencyMs);
  }

  private recordFailure(latencyMs: number): void {
    this.totalRequests += 1;
    this.failedRequests += 1;
    this.requestsInWindow += 1;
    this.pushLatency(latencyMs);
  }

  private pushLatency(latencyMs: number): void {
    this.latenciesMs.push(Math.max(0, Math.round(latencyMs)));
    if (this.latenciesMs.length > MAX_LATENCY_WINDOW) {
      this.latenciesMs = this.latenciesMs.slice(-MAX_LATENCY_WINDOW);
    }
  }

  private tickMetrics(): void {
    if (!this.running) {
      return;
    }

    const now = Date.now();
    const elapsedSec = Math.round(((now - this.startedAt) / 1000) * 10) / 10;

    if (!this.cancelled && elapsedSec >= this.options.durationSec) {
      this.cancelled = true;
      void Promise.all(this.vuTasks).finally(() => this.finishRun());
    }

    const windowSec = Math.max(0.001, (now - this.windowStartedAt) / 1000);
    const requestsPerSec = Math.round((this.requestsInWindow / windowSec) * 10) / 10;
    this.requestsInWindow = 0;
    this.windowStartedAt = now;

    const errorRatePercent =
      this.totalRequests === 0
        ? 0
        : Math.round((this.failedRequests / this.totalRequests) * 10000) / 100;
    const successRatePercent = Math.max(0, 100 - errorRatePercent);
    const activeVus = activeVirtualUsers(
      elapsedSec,
      this.options.virtualUsers,
      this.options.rampUpSec,
    );
    const latencyMs = computeLatencySnapshot(this.latenciesMs);

    const sample = {
      elapsedSec,
      virtualUsers: activeVus,
      requestsPerSec,
      errorRatePercent,
      p50LatencyMs: latencyMs.p50,
      p95LatencyMs: latencyMs.p95,
      avgLatencyMs: latencyMs.avg,
    };

    const samples = [...this.metrics.samples, sample].slice(-MAX_SAMPLES);
    const peakRequestsPerSec = Math.max(this.metrics.peakRequestsPerSec, requestsPerSec);

    this.metrics = loadTestRunMetricsSchema.parse({
      running: this.running,
      elapsedSec,
      virtualUsers: activeVus,
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
      successRatePercent,
      requestsPerSec,
      peakRequestsPerSec,
      errorRatePercent,
      latencyMs,
      samples,
    });

  }

  private finishRun(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.stopMetricsTimer();
    this.tickMetrics();
    this.metrics = loadTestRunMetricsSchema.parse({
      ...this.metrics,
      running: false,
    });
  }

  private stopMetricsTimer(): void {
    if (this.metricsTimer !== null) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }
}

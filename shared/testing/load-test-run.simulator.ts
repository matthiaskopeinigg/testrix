import {
  createIdleLoadTestRunMetrics,
  loadTestRunMetricsSchema,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
} from './load-test-run.schema';

const MAX_SAMPLES = 120;
const TICK_MS = 500;

/** Simulates load test metrics until cancelled or duration elapses. */
export class LoadTestRunSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private options: LoadTestStartOptions = { virtualUsers: 10, durationSec: 60, rampUpSec: 0 };
  private metrics: LoadTestRunMetrics = createIdleLoadTestRunMetrics();

  /** Returns the latest metrics snapshot. */
  snapshot(): LoadTestRunMetrics {
    return this.metrics;
  }

  /** Starts a simulated run; returns initial metrics. */
  start(options: LoadTestStartOptions): LoadTestRunMetrics {
    this.stopTimer();
    this.options = options;
    this.startedAt = Date.now();
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
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return this.snapshot();
  }

  /** Cancels the run and returns final metrics. */
  cancel(): LoadTestRunMetrics {
    this.stopTimer();
    this.metrics = loadTestRunMetricsSchema.parse({
      ...this.metrics,
      running: false,
    });
    return this.snapshot();
  }

  /** Clears simulator state back to idle metrics. */
  reset(): LoadTestRunMetrics {
    this.stopTimer();
    this.metrics = createIdleLoadTestRunMetrics();
    return this.snapshot();
  }

  private tick(): void {
    const elapsedSec = (Date.now() - this.startedAt) / 1000;
    const { virtualUsers, durationSec, rampUpSec } = this.options;

    if (elapsedSec >= durationSec) {
      this.finishRun(elapsedSec);
      return;
    }

    const rampProgress =
      rampUpSec <= 0 ? 1 : Math.min(1, elapsedSec / Math.max(rampUpSec, 0.001));
    const activeVus = Math.max(1, Math.round(virtualUsers * rampProgress));
    const baseRps = activeVus * (2.4 + Math.sin(elapsedSec / 3) * 0.35);
    const noise = 0.85 + ((elapsedSec * 17) % 1) * 0.3;
    const requestsPerSec = Math.max(0, baseRps * noise);
    const tickRequests = Math.round(requestsPerSec * (TICK_MS / 1000));
    const totalRequests = this.metrics.totalRequests + tickRequests;
    const errorRatePercent = Math.min(
      4.5,
      Math.max(0.05, 0.35 + Math.sin(elapsedSec / 5) * 0.25 + activeVus / 800),
    );
    const failedRequests =
      this.metrics.failedRequests + Math.round(tickRequests * (errorRatePercent / 100));
    const successRatePercent = Math.max(0, 100 - errorRatePercent);
    const p50 = 42 + activeVus * 0.08 + Math.sin(elapsedSec / 4) * 6;
    const p95 = p50 * 1.65 + 12;
    const p99 = p95 * 1.25;
    const avg = p50 * 0.92;
    const roundedRps = Math.round(requestsPerSec * 10) / 10;

    const sample = {
      elapsedSec: Math.round(elapsedSec * 10) / 10,
      virtualUsers: activeVus,
      requestsPerSec: roundedRps,
      errorRatePercent: Math.round(errorRatePercent * 100) / 100,
      p50LatencyMs: Math.round(p50),
      p95LatencyMs: Math.round(p95),
      avgLatencyMs: Math.round(avg),
    };

    const samples = [...this.metrics.samples, sample].slice(-MAX_SAMPLES);
    const peakRequestsPerSec = Math.max(this.metrics.peakRequestsPerSec, roundedRps);

    this.metrics = loadTestRunMetricsSchema.parse({
      running: true,
      elapsedSec: Math.round(elapsedSec * 10) / 10,
      virtualUsers: activeVus,
      totalRequests,
      failedRequests,
      successRatePercent: Math.round(successRatePercent * 100) / 100,
      requestsPerSec: roundedRps,
      peakRequestsPerSec,
      errorRatePercent: sample.errorRatePercent,
      latencyMs: {
        avg: Math.round(avg),
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
      },
      samples,
    });
  }

  private finishRun(elapsedSec: number): void {
    this.stopTimer();
    this.metrics = loadTestRunMetricsSchema.parse({
      ...this.metrics,
      running: false,
      elapsedSec: Math.round(elapsedSec * 10) / 10,
    });
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

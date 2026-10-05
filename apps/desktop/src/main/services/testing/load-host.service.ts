import type { ConfigStore } from '../config.service';
import type { HttpHost } from '../http-host.service';
import {
  aggregateLoadSamples,
  DEFAULT_FOLDER_AUTH,
  encodeRequestBody,
  environmentVariableMap,
  evaluateLoadThresholds,
  loadThresholdMissed,
  requestConfigOf,
  type CollectionHttpNode,
  type CollectionNode,
  type LoadArtifactFields,
  type LoadHeaderRow,
  type LoadMetricSample,
  type LoadMetrics,
  type LoadRunRecord,
  type LoadRunStatus,
  type ServiceRuntimeStatus,
} from '@testrix/contracts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function walkHttp(nodes: readonly CollectionNode[], id: string): CollectionHttpNode | null {
  for (const node of nodes) {
    if (node.kind === 'http' && node.id === id)
      return node;
    if (node.kind === 'folder') {
      const found = walkHttp(node.children, id);
      if (found)
        return found;
    }
  }
  return null;
}

interface ResolvedTarget {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
  readonly body: string;
}

const SAMPLE_INTERVAL_MS = 500;
const MAX_CHART_SAMPLES = 120;
const MAX_VIRTUAL_USERS = 1000;

/**
 * Virtual-user loop against executeHttp.
 */
export class LoadHost {
  private abort: AbortController | null = null;
  private status: ServiceRuntimeStatus = { running: false, label: 'Idle', error: null };
  private onMetrics: ((metrics: LoadMetrics) => void) | null = null;
  private chartSamples: LoadMetricSample[] = [];
  private lastSampleAt = 0;
  private activeVus = 0;
  private peakRps = 0;
  private aborted = false;

  constructor(
    private readonly http: HttpHost,
    private readonly store: ConfigStore,
  ) {}

  bind(listener: ((metrics: LoadMetrics) => void) | null): void {
    this.onMetrics = listener;
  }

  snapshot(): ServiceRuntimeStatus {
    return this.status;
  }

  async stop(): Promise<ServiceRuntimeStatus> {
    if (this.abort) {
      this.aborted = true;
      this.abort.abort();
    }
    this.abort = null;
    this.status = { running: false, label: 'Idle', error: null };
    return this.status;
  }

  async start(
    artifact: LoadArtifactFields & { readonly id: string; readonly name: string },
  ): Promise<{ readonly status: ServiceRuntimeStatus; readonly run: LoadRunRecord | null }> {
    await this.stop();
    const controller = new AbortController();
    this.abort = controller;
    this.aborted = false;
    this.status = { running: true, label: `Running ${artifact.name}`, error: null };
    this.chartSamples = [];
    this.lastSampleAt = 0;
    this.activeVus = 0;
    this.peakRps = 0;

    const target = this.resolveTarget(artifact);
    if (!target.url.trim()) {
      this.status = { running: false, label: 'Failed', error: 'Load target URL is empty' };
      return { status: this.status, run: null };
    }

    const envVars = this.resolveEnvVars(artifact.environmentId);
    const started = Date.now();
    const durationMs = Math.max(1, artifact.durationSec) * 1000;
    const users = Math.max(1, Math.min(MAX_VIRTUAL_USERS, artifact.virtualUsers));
    const ramp = Math.max(0, artifact.rampUpSec) * 1000;
    const durations: number[] = [];
    let errors = 0;

    // Publish immediately so the Results dock is never stuck on the previous run.
    this.emit(started, durations, errors, true);
    // Heartbeat keeps charts/stats moving during ramp or slow first responses.
    // Per-request emits are throttled inside emit() to avoid flooding the renderer.
    const heartbeat = setInterval(() => {
      if (controller.signal.aborted)
        return;
      this.emit(started, durations, errors, true);
    }, SAMPLE_INTERVAL_MS);

    const runVu = async (index: number): Promise<void> => {
      if (ramp > 0)
        await sleep((ramp / users) * index);
      if (controller.signal.aborted)
        return;
      this.activeVus += 1;
      while (!controller.signal.aborted && Date.now() - started < durationMs) {
        const tick = Date.now();
        try {
          const response = await this.http.execute({
            method: target.method || 'GET',
            url: target.url,
            headers: [...target.headers],
            body: target.body,
            followRedirects: true,
            verifyTls: true,
            timeoutMs: 30000,
            sendCookies: false,
            cookies: [],
            auth: DEFAULT_FOLDER_AUTH,
            preRequest: [],
            postResponse: [],
            variables: envVars,
            abortId: `load-${artifact.id}-${index}-${tick}`,
          });
          durations.push(Math.max(0, Date.now() - tick));
          if (response.status >= 400)
            errors += 1;
        } catch {
          errors += 1;
          durations.push(Math.max(0, Date.now() - tick));
        }
        this.emit(started, durations, errors, true);
      }
      this.activeVus = Math.max(0, this.activeVus - 1);
    };

    try {
      await Promise.all(Array.from({ length: users }, (_item, index) => runVu(index)));
    } catch (error) {
      this.status = {
        running: false,
        label: 'Failed',
        error: error instanceof Error ? error.message : 'Load run failed',
      };
      return { status: this.status, run: null };
    } finally {
      clearInterval(heartbeat);
    }

    const elapsed = Date.now() - started;
    const stats = aggregateLoadSamples(durations, errors, elapsed);
    this.activeVus = 0;
    this.status = { running: false, label: 'Idle', error: null };
    this.emit(started, durations, errors, false);
    const wasAborted = this.aborted || controller.signal.aborted;
    this.aborted = false;
    const requests = stats.requests;
    const errorRatePercent = requests === 0 ? 0 : (errors / requests) * 100;
    const successRatePercent = requests === 0 ? 100 : ((requests - errors) / requests) * 100;
    const thresholdResults = evaluateLoadThresholds(artifact, stats);
    const failed = loadThresholdMissed(artifact, stats);
    const status: LoadRunStatus = wasAborted ? 'cancelled' : failed ? 'failed' : 'passed';
    const error = wasAborted ? 'Cancelled' : failed ? 'Threshold missed' : null;
    return {
      status: this.status,
      run: {
        id: `run_${started.toString(36)}`,
        at: new Date(started).toISOString(),
        durationMs: elapsed,
        virtualUsers: users,
        requests: stats.requests,
        errors: stats.errors,
        p50Ms: stats.p50Ms,
        p95Ms: stats.p95Ms,
        p99Ms: stats.p99Ms,
        rps: stats.rps,
        avgMs: stats.avgMs,
        peakRps: this.peakRps,
        successRatePercent,
        errorRatePercent,
        status,
        error,
        thresholdResults,
        samples: [...this.chartSamples],
      },
    };
  }

  private resolveTarget(
    artifact: LoadArtifactFields,
  ): ResolvedTarget {
    if (artifact.targetSource === 'collection' && artifact.targetRequestId) {
      const request = walkHttp(this.store.collections.collections, artifact.targetRequestId);
      if (request) {
        const config = requestConfigOf(request);
        const encoded = encodeRequestBody(config.body);
        return {
          method: request.method,
          url: config.url || artifact.url || 'https://127.0.0.1/',
          headers: config.headers
            .filter((row) => row.enabled && row.key.trim())
            .map((row) => ({ key: row.key, value: row.value })),
          body: encoded.text,
        };
      }
    }
    return {
      method: artifact.method || 'GET',
      url: artifact.url,
      headers: enabledHeaders(artifact.headers),
      body: artifact.body ?? '',
    };
  }

  private resolveEnvVars(environmentId: string | null): Record<string, string> {
    const envId = environmentId ?? this.store.environments.activeId;
    if (!envId)
      return {};
    const env = this.store.environments.items.find((item) => item.id === envId);
    return env ? environmentVariableMap(env.variables) : {};
  }

  private emit(started: number, durations: number[], errors: number, running: boolean): void {
    const elapsed = Date.now() - started;
    const stats = aggregateLoadSamples(durations, errors, elapsed);
    this.peakRps = Math.max(this.peakRps, stats.rps);
    const requests = stats.requests;
    const errorRatePercent = requests === 0 ? 0 : (errors / requests) * 100;
    const successRatePercent = requests === 0 ? 100 : ((requests - errors) / requests) * 100;
    const virtualUsers = this.activeVus;
    const now = Date.now();
    const shouldSample =
      !running || now - this.lastSampleAt >= SAMPLE_INTERVAL_MS || this.chartSamples.length === 0;
    if (!shouldSample)
      return;
    this.lastSampleAt = now;
    this.chartSamples = [
      ...this.chartSamples,
      {
        elapsedMs: elapsed,
        elapsedSec: elapsed / 1000,
        requests: stats.requests,
        errors: stats.errors,
        rps: stats.rps,
        avgMs: stats.avgMs,
        p50Ms: stats.p50Ms,
        p95Ms: stats.p95Ms,
        p99Ms: stats.p99Ms,
        virtualUsers,
        errorRatePercent,
      },
    ].slice(-MAX_CHART_SAMPLES);
    this.onMetrics?.({
      running,
      elapsedMs: elapsed,
      requests: stats.requests,
      errors: stats.errors,
      rps: stats.rps,
      avgMs: stats.avgMs,
      p50Ms: stats.p50Ms,
      p95Ms: stats.p95Ms,
      p99Ms: stats.p99Ms,
      virtualUsers,
      successRatePercent,
      errorRatePercent,
      peakRps: this.peakRps,
      samples: [...this.chartSamples],
    });
  }
}

function enabledHeaders(
  headers: readonly LoadHeaderRow[],
): readonly { readonly key: string; readonly value: string }[] {
  return headers
    .filter((row) => row.enabled !== false && row.key.trim())
    .map((row) => ({ key: row.key, value: row.value }));
}

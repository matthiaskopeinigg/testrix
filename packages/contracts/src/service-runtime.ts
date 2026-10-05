import type { LoadMetricSample } from './load-file';
import type { RegressionFlowTimelineEntry, RegressionMetricsSample } from './regressions-file';

export type { LoadMetricSample } from './load-file';

export interface ServiceRuntimeStatus {
  readonly running: boolean;
  readonly label: string;
  readonly error: string | null;
}

export interface MockMismatch {
  readonly id: string;
  readonly at: string;
  readonly method: string;
  readonly url: string;
}

export interface MockActivityEvent {
  readonly kind: 'match' | 'mismatch';
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly endpointId?: string;
  readonly at?: number;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly requestBody?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ListenerHitEvent {
  readonly listenerId: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly at: number;
  /** CDP Network ResourceType when known (Document, XHR, Fetch, …). */
  readonly resourceType?: string;
}

export interface LoadMetrics {
  readonly running: boolean;
  readonly elapsedMs: number;
  readonly requests: number;
  readonly errors: number;
  readonly rps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  /** Active virtual users at this tick. */
  readonly virtualUsers: number;
  /** Success rate as a percentage (0–100). */
  readonly successRatePercent: number;
  /** Error rate as a percentage (0–100). */
  readonly errorRatePercent: number;
  /** Highest requests-per-second observed so far this run. */
  readonly peakRps: number;
  /** Mean request latency in milliseconds. */
  readonly avgMs: number;
  readonly samples: readonly LoadMetricSample[];
}

export interface FlowRunEventDetail {
  readonly kind: string;
  readonly method?: string;
  readonly url?: string;
  readonly status?: number;
  readonly body?: string;
  readonly requestBody?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly captures?: Readonly<Record<string, string>>;
  readonly hit?: boolean;
  readonly expected?: string;
  readonly actual?: string;
}

  /** True when a run detail is an HTTP exchange owned by Request / Listen / Intercept / Capture. */
export function flowDetailHasExchange(detail: FlowRunEventDetail | null | undefined): boolean {
  if (!detail)
    return false;
  // Validators assert; the exchange lives on the producer node (request / listen / intercept).
  if (detail.kind !== 'request' && detail.kind !== 'listener' && detail.kind !== 'interceptor' && detail.kind !== 'capture')
    return false;
  // Listen / Intercept: only after a real hit (not arm-only / miss).
  if ((detail.kind === 'listener' || detail.kind === 'interceptor') && detail.hit !== true)
    return false;
  if (detail.status !== undefined)
    return true;
  if (detail.body || detail.requestBody)
    return true;
  if (detail.url)
    return true;
  if (detail.captures && Object.keys(detail.captures).length > 0)
    return true;
  if (detail.headers && Object.keys(detail.headers).length > 0)
    return true;
  return false;
}

export interface FlowRunEvent {
  readonly flowId: string;
  readonly scenarioId: string;
  readonly stepId: string;
  readonly status: 'running' | 'ok' | 'error' | 'skipped';
  readonly message: string;
  readonly rowIndex: number;
  readonly durationMs: number;
  readonly detail?: FlowRunEventDetail;
}

/** Main → renderer: pause a run until the user enters text for a Manual step. */
export interface FlowManualPromptRequest {
  readonly requestId: string;
  readonly title: string;
  readonly prompt: string;
  readonly variable: string;
  readonly placeholder?: string;
}

/** Renderer → main: answer (or cancel) a Manual step prompt. */
export interface FlowManualPromptReply {
  readonly requestId: string;
  readonly ok: boolean;
  readonly value: string;
}

export interface InterceptHitEvent {
  readonly ruleId: string;
  readonly id?: string;
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly action: string;
  readonly body?: string;
  readonly requestBody?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly at: number;
}

export interface RegressionSuiteEvent {
  readonly regressionId: string;
  readonly phase: 'suite-start' | 'entry-start' | 'entry-end' | 'progress' | 'suite-done';
  readonly message: string;
  readonly total?: number;
  readonly completed?: number;
  readonly entry?: {
    readonly flowId: string;
    readonly flowName: string;
    readonly scenarioId: string;
    readonly scenarioName: string;
    readonly status: 'ok' | 'error' | 'skipped' | 'cancelled' | 'running';
    readonly durationMs: number;
    readonly error: string | null;
  };
  /** Live suite counters, present on entry/progress/suite events. */
  readonly passed?: number;
  readonly failed?: number;
  readonly skipped?: number;
  readonly elapsedSec?: number;
  readonly activeParallelism?: number;
  /** Live metrics time-series accumulated so far this run. */
  readonly samples?: readonly RegressionMetricsSample[];
  /** Live Gantt timeline accumulated so far this run. */
  readonly flowTimeline?: readonly RegressionFlowTimelineEntry[];
}

export interface RegressionRunOptions {
  /** Keys are `flowId::scenarioId` for a specific scenario, or `flowId::` for all enabled. */
  readonly onlyKeys?: readonly string[];
}

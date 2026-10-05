import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const REGRESSION_SECTIONS = ['overview', 'pack', 'settings', 'docs'] as const;
export type RegressionSection = (typeof REGRESSION_SECTIONS)[number];

/** Upper bound for concurrent regression workers. */
export const REGRESSION_MAX_PARALLELISM = 16;

export type RegressionExecutionMode = 'sequential' | 'parallel';

/** Clamps a worker count into 1…REGRESSION_MAX_PARALLELISM. */
export function clampRegressionParallelism(value: number): number {
  if (!Number.isFinite(value))
    return 4;
  return Math.max(1, Math.min(REGRESSION_MAX_PARALLELISM, Math.round(value)));
}

/** Maximum time-series samples kept on each stored run record. */
export const REGRESSION_RUN_SAMPLES_MAX = 120;

/** Maximum completed runs stored per regression artifact. */
export const REGRESSION_RUN_HISTORY_MAX = 40;

export type RegressionEntryStatus = 'ok' | 'error' | 'skipped' | 'cancelled';
export type RegressionSuiteStatus = 'passed' | 'failed' | 'cancelled';

/** Timeline bar status: entry statuses plus in-flight `running`. */
export type RegressionTimelineStatus = RegressionEntryStatus | 'running';

export interface RegressionPackEntry {
  readonly id: string;
  readonly flowId: string;
  /** Null means every enabled scenario on the flow. */
  readonly scenarioId: string | null;
  readonly enabled: boolean;
}

export interface RegressionRunEntry {
  readonly flowId: string;
  readonly flowName: string;
  readonly scenarioId: string;
  readonly scenarioName: string;
  readonly status: RegressionEntryStatus;
  readonly durationMs: number;
  readonly error: string | null;
}

/** One point in a run's live time-series (driven by the host while running). */
export interface RegressionMetricsSample {
  readonly elapsedSec: number;
  readonly completedFlows: number;
  readonly passedFlows: number;
  readonly failedFlows: number;
  readonly skippedFlows: number;
  readonly activeParallelism: number;
  readonly passRatePercent: number;
  readonly avgFlowDurationMs: number;
}

/** A single flow/scenario bar on the Gantt-style run timeline. */
export interface RegressionFlowTimelineEntry {
  readonly flowId: string;
  readonly flowName: string;
  /** Scenario label when the suite expands flows into per-scenario jobs. */
  readonly scenarioName?: string;
  readonly workerSlot: number;
  readonly startedAtOffsetMs: number;
  readonly durationMs: number;
  readonly status: RegressionTimelineStatus;
}

export interface RegressionRunRecord {
  readonly id: string;
  readonly at: string;
  readonly durationMs: number;
  readonly status: RegressionSuiteStatus;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly environmentId: string | null;
  readonly release: string;
  readonly error: string | null;
  readonly entries: readonly RegressionRunEntry[];
  /** Live metrics time-series captured while the suite ran (may be empty on old records). */
  readonly samples: readonly RegressionMetricsSample[];
  /** Per-entry timeline used to render the Gantt chart (may be empty on old records). */
  readonly flowTimeline: readonly RegressionFlowTimelineEntry[];
  /** Average completed-entry duration in ms. */
  readonly avgDurationMs?: number;
  /** 95th percentile completed-entry duration in ms. */
  readonly p95DurationMs?: number;
}

export interface RegressionArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly docs: string;
  readonly release: string;
  readonly environmentId: string | null;
  /** When set, descendant flows of this services folder stay linked on sync. */
  readonly linkedFolderId: string | null;
  readonly entries: readonly RegressionPackEntry[];
  readonly goldenRunId: string | null;
  readonly archivedAt: string | null;
  /** Fail the suite when failed / (passed+failed) exceeds this ratio (0–1). 0 = any failure fails. */
  readonly maxErrorRate: number;
  /** Sequential runs one entry at a time. Parallel uses `maxParallelism` workers. */
  readonly executionMode: RegressionExecutionMode;
  /** Concurrent entries when executionMode is parallel. */
  readonly maxParallelism: number;
  /** Stop scheduling new entries after the first failure. In-flight entries finish. */
  readonly stopOnFirstFailure: boolean;
  /** Extra attempts after a failed entry (0–3). */
  readonly retryFailed: number;
  /** Pause between entries on the same worker, in milliseconds. */
  readonly delayBetweenFlowsMs: number;
  /** Shuffle entry order before the suite starts. */
  readonly shuffleOrder: boolean;
  readonly runs: readonly RegressionRunRecord[];
}

export type RegressionNode = ServiceTreeNode<RegressionArtifactFields>;

export interface RegressionsFile {
  readonly schemaVersion: number;
  readonly items: readonly RegressionNode[];
}

export const DEFAULT_REGRESSIONS_FILE: RegressionsFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function newRegressionEntryId(): string {
  return newEntityId();
}

export function newRegressionRunId(): string {
  return newEntityId();
}

export function emptyRegressionPackEntry(
  flowId: string,
  scenarioId: string | null = null,
): RegressionPackEntry {
  return {
    id: newRegressionEntryId(),
    flowId,
    scenarioId,
    enabled: true,
  };
}

export function emptyRegressionArtifact(name = 'New regression'): RegressionNode {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    docs: '',
    release: '',
    environmentId: null,
    linkedFolderId: null,
    entries: [],
    goldenRunId: null,
    archivedAt: null,
    maxErrorRate: 0,
    executionMode: 'parallel',
    maxParallelism: 4,
    stopOnFirstFailure: false,
    retryFailed: 0,
    delayBetweenFlowsMs: 0,
    shuffleOrder: false,
    runs: [],
  };
}

export function normalizeRegressionSection(raw: string | null | undefined): RegressionSection {
  if (raw === 'flows' || raw === 'pack')
    return 'pack';
  // Legacy Results section — results live in the dock now.
  if (raw === 'results' || raw === 'runs')
    return 'overview';
  if (raw === 'docs')
    return 'docs';
  if (raw === 'overview' || raw === 'settings')
    return raw;
  return 'overview';
}

function clampRetry(value: unknown): number {
  const parsed = typeof value === 'number' ? value : 0;
  if (!Number.isFinite(parsed))
    return 0;
  return Math.max(0, Math.min(3, Math.round(parsed)));
}

function clampDelay(value: unknown): number {
  const parsed = typeof value === 'number' ? value : 0;
  if (!Number.isFinite(parsed))
    return 0;
  return Math.max(0, Math.min(60_000, Math.round(parsed)));
}

function parsePackEntry(raw: unknown): RegressionPackEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const flowId = typeof source['flowId'] === 'string' && source['flowId'] ? source['flowId'] : '';
  if (!flowId)
    return null;
  return {
    id: typeof source['id'] === 'string' && source['id'] ? source['id'] : newRegressionEntryId(),
    flowId,
    scenarioId:
      typeof source['scenarioId'] === 'string' && source['scenarioId'] ? source['scenarioId'] : null,
    enabled: source['enabled'] !== false,
  };
}

function parseRunEntry(raw: unknown): RegressionRunEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const flowId = typeof source['flowId'] === 'string' ? source['flowId'] : '';
  const scenarioId = typeof source['scenarioId'] === 'string' ? source['scenarioId'] : '';
  const statusRaw = source['status'];
  const status: RegressionEntryStatus =
    statusRaw === 'ok' || statusRaw === 'error' || statusRaw === 'skipped' || statusRaw === 'cancelled'
      ? statusRaw
      : 'error';
  return {
    flowId,
    flowName: typeof source['flowName'] === 'string' ? source['flowName'] : flowId,
    scenarioId,
    scenarioName: typeof source['scenarioName'] === 'string' ? source['scenarioName'] : scenarioId,
    status,
    durationMs: typeof source['durationMs'] === 'number' ? source['durationMs'] : 0,
    error: typeof source['error'] === 'string' ? source['error'] : null,
  };
}

function parseMetricsSample(raw: unknown): RegressionMetricsSample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const num = (key: string): number =>
    typeof source[key] === 'number' && Number.isFinite(source[key]) ? (source[key] as number) : 0;
  return {
    elapsedSec: Math.max(0, num('elapsedSec')),
    completedFlows: Math.max(0, Math.round(num('completedFlows'))),
    passedFlows: Math.max(0, Math.round(num('passedFlows'))),
    failedFlows: Math.max(0, Math.round(num('failedFlows'))),
    skippedFlows: Math.max(0, Math.round(num('skippedFlows'))),
    activeParallelism: Math.max(0, Math.round(num('activeParallelism'))),
    passRatePercent: Math.max(0, Math.min(100, num('passRatePercent'))),
    avgFlowDurationMs: Math.max(0, num('avgFlowDurationMs')),
  };
}

function parseTimelineEntry(raw: unknown): RegressionFlowTimelineEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const flowId = typeof source['flowId'] === 'string' ? source['flowId'] : '';
  if (!flowId)
    return null;
  const statusRaw = source['status'];
  const status: RegressionTimelineStatus =
    statusRaw === 'ok' ||
    statusRaw === 'error' ||
    statusRaw === 'skipped' ||
    statusRaw === 'cancelled' ||
    statusRaw === 'running'
      ? statusRaw
      : 'ok';
  const scenarioName =
    typeof source['scenarioName'] === 'string' && source['scenarioName']
      ? source['scenarioName']
      : undefined;
  return {
    flowId,
    flowName: typeof source['flowName'] === 'string' ? source['flowName'] : flowId,
    ...(scenarioName ? { scenarioName } : {}),
    workerSlot: typeof source['workerSlot'] === 'number' ? Math.max(0, Math.round(source['workerSlot'])) : 0,
    startedAtOffsetMs:
      typeof source['startedAtOffsetMs'] === 'number' ? Math.max(0, source['startedAtOffsetMs']) : 0,
    durationMs: typeof source['durationMs'] === 'number' ? Math.max(0, source['durationMs']) : 0,
    status,
  };
}

function parseRunRecord(raw: unknown): RegressionRunRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : newRegressionRunId();
  const at = typeof source['at'] === 'string' && source['at'] ? source['at'] : new Date().toISOString();

  // Legacy LoadRunRecord → coarse suite record
  if (!Array.isArray(source['entries']) && typeof source['requests'] === 'number') {
    const errors = typeof source['errors'] === 'number' ? source['errors'] : 0;
    const requests = source['requests'];
    return {
      id,
      at,
      durationMs: typeof source['durationMs'] === 'number' ? source['durationMs'] : 0,
      status: errors > 0 ? 'failed' : 'passed',
      passed: Math.max(0, requests - errors),
      failed: errors,
      skipped: 0,
      environmentId: null,
      release: '',
      error: typeof source['error'] === 'string' ? source['error'] : null,
      entries: [],
      samples: [],
      flowTimeline: [],
    };
  }

  const statusRaw = source['status'];
  const status: RegressionSuiteStatus =
    statusRaw === 'passed' || statusRaw === 'failed' || statusRaw === 'cancelled'
      ? statusRaw
      : 'failed';
  const entries = Array.isArray(source['entries'])
    ? source['entries'].map(parseRunEntry).filter((item): item is RegressionRunEntry => item !== null)
    : [];
  const samples = Array.isArray(source['samples'])
    ? source['samples']
        .map(parseMetricsSample)
        .filter((item): item is RegressionMetricsSample => item !== null)
        .slice(-REGRESSION_RUN_SAMPLES_MAX)
    : [];
  const flowTimeline = Array.isArray(source['flowTimeline'])
    ? source['flowTimeline']
        .map(parseTimelineEntry)
        .filter((item): item is RegressionFlowTimelineEntry => item !== null)
    : [];
  return {
    id,
    at,
    durationMs: typeof source['durationMs'] === 'number' ? source['durationMs'] : 0,
    status,
    passed: typeof source['passed'] === 'number' ? source['passed'] : entries.filter((e) => e.status === 'ok').length,
    failed: typeof source['failed'] === 'number' ? source['failed'] : entries.filter((e) => e.status === 'error').length,
    skipped:
      typeof source['skipped'] === 'number'
        ? source['skipped']
        : entries.filter((e) => e.status === 'skipped' || e.status === 'cancelled').length,
    environmentId: typeof source['environmentId'] === 'string' ? source['environmentId'] : null,
    release: typeof source['release'] === 'string' ? source['release'] : '',
    error: typeof source['error'] === 'string' ? source['error'] : null,
    entries,
    samples,
    flowTimeline,
    ...(typeof source['avgDurationMs'] === 'number' ? { avgDurationMs: source['avgDurationMs'] } : {}),
    ...(typeof source['p95DurationMs'] === 'number' ? { p95DurationMs: source['p95DurationMs'] } : {}),
  };
}

function parseEntries(value: Record<string, unknown>): RegressionPackEntry[] {
  if (Array.isArray(value['entries'])) {
    return value['entries']
      .map(parsePackEntry)
      .filter((item): item is RegressionPackEntry => item !== null);
  }
  // Legacy flowIds → one entry per flow (all enabled scenarios)
  if (Array.isArray(value['flowIds'])) {
    return value['flowIds']
      .filter((item): item is string => typeof item === 'string' && !!item)
      .map((flowId) => emptyRegressionPackEntry(flowId, null));
  }
  return [];
}

export function parseRegressionsFile(raw: unknown): RegressionsFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'], (value) => ({
      description: typeof value['description'] === 'string' ? value['description'] : '',
      tags: Array.isArray(value['tags'])
        ? value['tags'].filter((item): item is string => typeof item === 'string')
        : [],
      docs: typeof value['docs'] === 'string' ? value['docs'] : '',
      release: typeof value['release'] === 'string' ? value['release'] : '',
      environmentId:
        typeof value['environmentId'] === 'string' && value['environmentId']
          ? value['environmentId']
          : null,
      linkedFolderId:
        typeof value['linkedFolderId'] === 'string' && value['linkedFolderId']
          ? value['linkedFolderId']
          : null,
      entries: parseEntries(value),
      goldenRunId: typeof value['goldenRunId'] === 'string' ? value['goldenRunId'] : null,
      archivedAt: typeof value['archivedAt'] === 'string' ? value['archivedAt'] : null,
      maxErrorRate: typeof value['maxErrorRate'] === 'number' ? value['maxErrorRate'] : 0,
      executionMode: value['executionMode'] === 'sequential' ? 'sequential' : 'parallel',
      maxParallelism: clampRegressionParallelism(
        typeof value['maxParallelism'] === 'number' ? value['maxParallelism'] : 4,
      ),
      stopOnFirstFailure: value['stopOnFirstFailure'] === true,
      retryFailed: clampRetry(value['retryFailed']),
      delayBetweenFlowsMs: clampDelay(value['delayBetweenFlowsMs']),
      shuffleOrder: value['shuffleOrder'] === true,
      runs: Array.isArray(value['runs'])
        ? value['runs']
            .map(parseRunRecord)
            .filter((item): item is RegressionRunRecord => item !== null)
            .slice(0, REGRESSION_RUN_HISTORY_MAX)
        : [],
    })),
  };
}

/** Pass rate 0–1 for a suite run (passed / decided). */
export function regressionRunPassRate(run: RegressionRunRecord): number {
  const decided = run.passed + run.failed;
  if (decided <= 0)
    return run.status === 'passed' ? 1 : 0;
  return run.passed / decided;
}

/** Average + p95 duration (ms) over the given completed-entry durations. */
export function regressionDurationStats(
  durations: readonly number[],
): { readonly avgMs: number; readonly p95Ms: number } {
  if (durations.length === 0)
    return { avgMs: 0, p95Ms: 0 };
  const avgMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const sorted = [...durations].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return { avgMs, p95Ms: sorted[index]! };
}

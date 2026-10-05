import { CONFIG_SCHEMA_VERSION } from './settings';
import { httpMethodSchema } from './collection-tree';
import { newEntityId } from './entity-id';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const LOAD_SECTIONS = ['overview', 'target', 'profile', 'thresholds', 'docs'] as const;
export type LoadSection = (typeof LOAD_SECTIONS)[number];

/** Terminal status of a completed (or aborted) load run. */
export type LoadRunStatus = 'passed' | 'failed' | 'cancelled';

export interface LoadHeaderRow {
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
}

/**
 * One time-series metrics point captured during a load run.
 *
 * The first block of fields is the original flat shape; the trailing optional
 * fields are derived enrichments and stay backward compatible with old files.
 */
export interface LoadMetricSample {
  readonly elapsedMs: number;
  readonly requests: number;
  readonly errors: number;
  readonly rps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  /** Active virtual users at this tick. */
  readonly virtualUsers?: number;
  /** Mean request latency in milliseconds. */
  readonly avgMs?: number;
  /** Rolling error rate as a percentage (0–100). */
  readonly errorRatePercent?: number;
  /** Elapsed seconds; when omitted derive from `elapsedMs / 1000`. */
  readonly elapsedSec?: number;
}

/** Result of a single configured threshold evaluated against a finished run. */
export interface LoadThresholdResult {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly actual: string;
  readonly expected: string;
}

export interface LoadRunRecord {
  readonly id: string;
  readonly at: string;
  readonly durationMs: number;
  readonly virtualUsers: number;
  readonly requests: number;
  readonly errors: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly rps: number;
  readonly error?: string | null;
  /** Terminal run status; older files without it fall back to error presence. */
  readonly status?: LoadRunStatus;
  readonly avgMs?: number;
  readonly peakRps?: number;
  readonly successRatePercent?: number;
  readonly errorRatePercent?: number;
  readonly thresholdResults?: readonly LoadThresholdResult[];
  readonly samples: readonly LoadMetricSample[];
}

export interface LoadArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly docs: string;
  readonly targetSource: 'collection' | 'manual';
  readonly targetRequestId: string;
  readonly method: string;
  readonly url: string;
  readonly headers: readonly LoadHeaderRow[];
  readonly body: string;
  readonly environmentId: string | null;
  readonly durationSec: number;
  readonly virtualUsers: number;
  readonly rampUpSec: number;
  readonly maxErrorRate: number;
  readonly maxP95Ms: number;
  /** 0 = disabled. Otherwise fail when success rate falls below this percent. */
  readonly minSuccessRate: number;
  /** 0 = disabled. Otherwise fail when average RPS falls below this. */
  readonly minRps: number;
  readonly runs: readonly LoadRunRecord[];
}

export type LoadNode = ServiceTreeNode<LoadArtifactFields>;

export interface LoadFile {
  readonly schemaVersion: number;
  readonly items: readonly LoadNode[];
}

export const DEFAULT_LOAD_FILE: LoadFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function emptyLoadHeaderRow(key = '', value = ''): LoadHeaderRow {
  return { key, value, enabled: true };
}

export function emptyLoadArtifact(name = 'New load'): LoadNode {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    docs: '',
    targetSource: 'manual',
    targetRequestId: '',
    method: 'GET',
    url: 'https://127.0.0.1/',
    headers: [],
    body: '',
    environmentId: null,
    durationSec: 15,
    virtualUsers: 5,
    rampUpSec: 3,
    maxErrorRate: 5,
    maxP95Ms: 2000,
    minSuccessRate: 0,
    minRps: 0,
    runs: [],
  };
}

export function normalizeLoadSection(raw: string | null | undefined): LoadSection {
  if (raw === 'results')
    return 'overview';
  if (raw === 'scenarios')
    return 'profile';
  if (
    raw === 'overview' ||
    raw === 'target' ||
    raw === 'profile' ||
    raw === 'thresholds' ||
    raw === 'docs'
  )
    return raw;
  return 'overview';
}

function parseHeaderRow(raw: unknown): LoadHeaderRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const key = typeof source['key'] === 'string' ? source['key'] : '';
  if (!key)
    return null;
  return {
    key,
    value: typeof source['value'] === 'string' ? source['value'] : '',
    enabled: source['enabled'] !== false,
  };
}

function optionalNumber(source: Record<string, unknown>, key: string): number | undefined {
  return typeof source[key] === 'number' ? (source[key] as number) : undefined;
}

function parseMetricSample(raw: unknown): LoadMetricSample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const sample: LoadMetricSample = {
    elapsedMs: typeof source['elapsedMs'] === 'number' ? source['elapsedMs'] : 0,
    requests: typeof source['requests'] === 'number' ? source['requests'] : 0,
    errors: typeof source['errors'] === 'number' ? source['errors'] : 0,
    rps: typeof source['rps'] === 'number' ? source['rps'] : 0,
    p50Ms: typeof source['p50Ms'] === 'number' ? source['p50Ms'] : 0,
    p95Ms: typeof source['p95Ms'] === 'number' ? source['p95Ms'] : 0,
    p99Ms: typeof source['p99Ms'] === 'number' ? source['p99Ms'] : 0,
  };
  const virtualUsers = optionalNumber(source, 'virtualUsers');
  const avgMs = optionalNumber(source, 'avgMs');
  const errorRatePercent = optionalNumber(source, 'errorRatePercent');
  const elapsedSec = optionalNumber(source, 'elapsedSec');
  return {
    ...sample,
    ...(virtualUsers !== undefined ? { virtualUsers } : {}),
    ...(avgMs !== undefined ? { avgMs } : {}),
    ...(errorRatePercent !== undefined ? { errorRatePercent } : {}),
    ...(elapsedSec !== undefined ? { elapsedSec } : {}),
  };
}

function parseThresholdResults(raw: unknown): readonly LoadThresholdResult[] {
  if (!Array.isArray(raw))
    return [];
  const results: LoadThresholdResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const source = item as Record<string, unknown>;
    const id = typeof source['id'] === 'string' ? source['id'] : '';
    const label = typeof source['label'] === 'string' ? source['label'] : '';
    if (!id && !label)
      continue;
    results.push({
      id: id || label,
      label: label || id,
      ok: source['ok'] === true,
      actual: typeof source['actual'] === 'string' ? source['actual'] : '',
      expected: typeof source['expected'] === 'string' ? source['expected'] : '',
    });
  }
  return results;
}

function parseRunStatus(raw: unknown): LoadRunStatus | undefined {
  return raw === 'passed' || raw === 'failed' || raw === 'cancelled' ? raw : undefined;
}

function parseRunRecord(raw: unknown): LoadRunRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : newEntityId();
  const samples = Array.isArray(source['samples'])
    ? source['samples'].map(parseMetricSample).filter((item): item is LoadMetricSample => item !== null).slice(-60)
    : [];
  const status = parseRunStatus(source['status']);
  const avgMs = optionalNumber(source, 'avgMs');
  const peakRps = optionalNumber(source, 'peakRps');
  const successRatePercent = optionalNumber(source, 'successRatePercent');
  const errorRatePercent = optionalNumber(source, 'errorRatePercent');
  const thresholdResults = parseThresholdResults(source['thresholdResults']);
  return {
    id,
    at: typeof source['at'] === 'string' && source['at'] ? source['at'] : new Date().toISOString(),
    durationMs: typeof source['durationMs'] === 'number' ? source['durationMs'] : 0,
    virtualUsers: typeof source['virtualUsers'] === 'number' ? source['virtualUsers'] : 0,
    requests: typeof source['requests'] === 'number' ? source['requests'] : 0,
    errors: typeof source['errors'] === 'number' ? source['errors'] : 0,
    p50Ms: typeof source['p50Ms'] === 'number' ? source['p50Ms'] : 0,
    p95Ms: typeof source['p95Ms'] === 'number' ? source['p95Ms'] : 0,
    p99Ms: typeof source['p99Ms'] === 'number' ? source['p99Ms'] : 0,
    rps: typeof source['rps'] === 'number' ? source['rps'] : 0,
    error: typeof source['error'] === 'string' ? source['error'] : null,
    ...(status !== undefined ? { status } : {}),
    ...(avgMs !== undefined ? { avgMs } : {}),
    ...(peakRps !== undefined ? { peakRps } : {}),
    ...(successRatePercent !== undefined ? { successRatePercent } : {}),
    ...(errorRatePercent !== undefined ? { errorRatePercent } : {}),
    ...(thresholdResults.length > 0 ? { thresholdResults } : {}),
    samples,
  };
}

export function parseLoadFile(raw: unknown): LoadFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'], (value) => {
      const profile = value['profile'] && typeof value['profile'] === 'object' ? (value['profile'] as Record<string, unknown>) : {};
      const thresholds =
        value['thresholds'] && typeof value['thresholds'] === 'object'
          ? (value['thresholds'] as Record<string, unknown>)
          : {};
      return {
        description: typeof value['description'] === 'string' ? value['description'] : '',
        tags: Array.isArray(value['tags']) ? value['tags'].filter((item): item is string => typeof item === 'string') : [],
        docs: typeof value['docs'] === 'string' ? value['docs'] : '',
        targetSource: value['targetSource'] === 'collection' ? 'collection' : 'manual',
        targetRequestId: typeof value['targetRequestId'] === 'string' ? value['targetRequestId'] : '',
        method: typeof value['method'] === 'string' ? value['method'] : 'GET',
        url: typeof value['url'] === 'string' ? value['url'] : '',
        headers: Array.isArray(value['headers'])
          ? value['headers'].map(parseHeaderRow).filter((item): item is LoadHeaderRow => item !== null)
          : [],
        body: typeof value['body'] === 'string' ? value['body'] : '',
        environmentId: typeof value['environmentId'] === 'string' ? value['environmentId'] : null,
        durationSec: typeof profile['durationSec'] === 'number' ? profile['durationSec'] : typeof value['durationSec'] === 'number' ? value['durationSec'] : 15,
        virtualUsers: typeof profile['virtualUsers'] === 'number' ? profile['virtualUsers'] : typeof value['virtualUsers'] === 'number' ? value['virtualUsers'] : 5,
        rampUpSec: typeof profile['rampUpSec'] === 'number' ? profile['rampUpSec'] : typeof value['rampUpSec'] === 'number' ? value['rampUpSec'] : 3,
        maxErrorRate:
          typeof thresholds['maxErrorRate'] === 'number'
            ? thresholds['maxErrorRate']
            : typeof value['maxErrorRate'] === 'number'
              ? value['maxErrorRate']
              : 5,
        maxP95Ms:
          typeof thresholds['maxP95Ms'] === 'number'
            ? thresholds['maxP95Ms']
            : typeof value['maxP95Ms'] === 'number'
              ? value['maxP95Ms']
              : 2000,
        minSuccessRate:
          typeof thresholds['minSuccessRate'] === 'number'
            ? thresholds['minSuccessRate']
            : typeof value['minSuccessRate'] === 'number'
              ? value['minSuccessRate']
              : 0,
        minRps:
          typeof thresholds['minRps'] === 'number'
            ? thresholds['minRps']
            : typeof value['minRps'] === 'number'
              ? value['minRps']
              : 0,
        runs: Array.isArray(value['runs'])
          ? value['runs'].map(parseRunRecord).filter((item): item is LoadRunRecord => item !== null).slice(0, 30)
          : [],
      };
    }),
  };
}

/** Subset of artifact threshold fields used for pass/fail evaluation. */
export type LoadThresholdConfig = Pick<
  LoadArtifactFields,
  'maxErrorRate' | 'maxP95Ms' | 'minSuccessRate' | 'minRps'
>;

/** Run statistics required to evaluate thresholds. */
export type LoadThresholdStats = Pick<LoadRunRecord, 'requests' | 'errors' | 'p95Ms' | 'rps'>;

/**
 * Evaluates each configured threshold against a finished run.
 *
 * Optional min thresholds set to `0` are treated as disabled and omitted.
 */
export function evaluateLoadThresholds(
  artifact: LoadThresholdConfig,
  stats: LoadThresholdStats,
): readonly LoadThresholdResult[] {
  const requests = Math.max(0, stats.requests);
  const errors = Math.max(0, stats.errors);
  const errorRate = requests === 0 ? 100 : (errors / requests) * 100;
  const successRate = requests === 0 ? 0 : ((requests - errors) / requests) * 100;
  const results: LoadThresholdResult[] = [];

  results.push({
    id: 'maxErrorRate',
    label: 'Max error rate',
    ok: errorRate <= artifact.maxErrorRate,
    actual: `${errorRate.toFixed(2)}%`,
    expected: `≤ ${artifact.maxErrorRate}%`,
  });

  results.push({
    id: 'maxP95Ms',
    label: 'Max p95 latency',
    ok: stats.p95Ms <= artifact.maxP95Ms,
    actual: `${Math.round(stats.p95Ms)} ms`,
    expected: `≤ ${artifact.maxP95Ms} ms`,
  });

  if (artifact.minSuccessRate > 0) {
    results.push({
      id: 'minSuccessRate',
      label: 'Min success rate',
      ok: successRate >= artifact.minSuccessRate,
      actual: `${successRate.toFixed(2)}%`,
      expected: `≥ ${artifact.minSuccessRate}%`,
    });
  }

  if (artifact.minRps > 0) {
    results.push({
      id: 'minRps',
      label: 'Min throughput',
      ok: stats.rps >= artifact.minRps,
      actual: `${stats.rps.toFixed(1)} rps`,
      expected: `≥ ${artifact.minRps} rps`,
    });
  }

  return results;
}

/** Evaluates whether a finished run missed any configured thresholds. */
export function loadThresholdMissed(
  artifact: LoadThresholdConfig,
  stats: LoadThresholdStats,
): boolean {
  return evaluateLoadThresholds(artifact, stats).some((result) => !result.ok);
}

/** Derives the terminal status of a finished run from its thresholds. */
export function loadRunStatusFrom(
  artifact: LoadThresholdConfig,
  stats: LoadThresholdStats,
): LoadRunStatus {
  return loadThresholdMissed(artifact, stats) ? 'failed' : 'passed';
}

export { httpMethodSchema as loadMethodSchema };

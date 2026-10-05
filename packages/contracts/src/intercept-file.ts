import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const INTERCEPT_SECTIONS = ['match', 'action', 'activity'] as const;
export type InterceptSection = (typeof INTERCEPT_SECTIONS)[number];

/**
 * Maps a persisted or legacy section id onto a valid Intercept section.
 */
export function normalizeInterceptSection(raw: string | null | undefined): InterceptSection {
  if (raw === 'match' || raw === 'action' || raw === 'activity')
    return raw;
  // Legacy overview / hits tabs land on Activity.
  if (raw === 'overview' || raw === 'hits')
    return 'activity';
  return 'match';
}

export const INTERCEPT_MODES = ['browser', 'device'] as const;
export type InterceptMode = (typeof INTERCEPT_MODES)[number];

/** Prefer passthrough (edit); legacy `proxy` maps to passthrough. */
export const INTERCEPT_ACTIONS = ['passthrough', 'mock', 'block'] as const;
export type InterceptAction = (typeof INTERCEPT_ACTIONS)[number];

/** @deprecated Use InterceptAction; kept for older files. */
export const interceptActionSchema = ['proxy', 'mock', 'block', 'passthrough'] as const;

/** Max persisted Activity hits kept per intercept artifact. */
export const INTERCEPT_ACTIVITY_MAX = 200;

/** One Activity hit stored on the intercept artifact. */
export interface InterceptActivityEntry {
  readonly id: string;
  readonly at: number;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly action: string;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly body: string;
}

export interface InterceptArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly enabled: boolean;
  readonly mode: InterceptMode;
  /** Browser start URL (supports {{placeholders}} and plain hostnames). */
  readonly startUrl: string;
  /** Emulator device id from Emulator sidebar. */
  readonly deviceId: string;
  readonly stage: 'request' | 'response';
  readonly method: string;
  readonly match: string;
  readonly url: string;
  readonly headerName: string;
  readonly headerValue: string;
  readonly bodyContains: string;
  readonly action: InterceptAction;
  /** KV rows JSON or legacy object */
  readonly setHeaders: string;
  readonly removeHeaders: string;
  readonly setBody: string;
  readonly bodyMode: string;
  readonly mockStatus: number;
  readonly mockBody: string;
  /** Newest-first Activity hits (persisted in intercept.json). */
  readonly activity: readonly InterceptActivityEntry[];
  /** @deprecated Prefer `url` */
  readonly matchUrl?: string;
}

export type InterceptNode = ServiceTreeNode<InterceptArtifactFields>;

export interface InterceptFile {
  readonly schemaVersion: number;
  readonly items: readonly InterceptNode[];
}

export const DEFAULT_INTERCEPT_FILE: InterceptFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function emptyInterceptArtifact(name = 'New rule'): InterceptNode {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    enabled: true,
    mode: 'browser',
    startUrl: 'http://127.0.0.1/',
    deviceId: '',
    stage: 'request',
    method: '*',
    match: 'contains',
    url: '',
    headerName: '',
    headerValue: '',
    bodyContains: '',
    action: 'passthrough',
    setHeaders: '[]',
    removeHeaders: '[]',
    setBody: '',
    bodyMode: 'json',
    mockStatus: 200,
    mockBody: '{\n}\n',
    activity: [],
  };
}

export function newInterceptActivityId(_now: number | string = Date.now()): string {
  return newEntityId();
}

/**
 * Prepends a hit and caps history length (newest first).
 */
export function prependInterceptActivity(
  activity: readonly InterceptActivityEntry[],
  entry: InterceptActivityEntry,
): InterceptActivityEntry[] {
  const id = entry.id || newInterceptActivityId(entry.at);
  const next = [{ ...entry, id }, ...activity.filter((item) => item.id !== id)];
  return next.slice(0, INTERCEPT_ACTIVITY_MAX);
}

export function parseInterceptFile(raw: unknown): InterceptFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'], (value) => {
      const legacyUrl =
        typeof value['matchUrl'] === 'string'
          ? value['matchUrl']
          : typeof value['url'] === 'string'
            ? value['url']
            : '';
      const rawAction = value['action'];
      const action: InterceptAction =
        rawAction === 'mock' || rawAction === 'block'
          ? rawAction
          : rawAction === 'proxy' || rawAction === 'passthrough'
            ? 'passthrough'
            : 'passthrough';
      return {
        description: typeof value['description'] === 'string' ? value['description'] : '',
        tags: Array.isArray(value['tags']) ? value['tags'].filter((item): item is string => typeof item === 'string') : [],
        enabled: value['enabled'] !== false,
        mode: value['mode'] === 'device' ? 'device' : 'browser',
        startUrl: typeof value['startUrl'] === 'string' ? value['startUrl'] : 'http://127.0.0.1/',
        deviceId: typeof value['deviceId'] === 'string' ? value['deviceId'] : '',
        stage: value['stage'] === 'response' ? 'response' : 'request',
        method: typeof value['method'] === 'string' ? value['method'] : '*',
        match: typeof value['match'] === 'string' ? value['match'] : 'contains',
        url: legacyUrl === '*' ? '' : legacyUrl,
        headerName: typeof value['headerName'] === 'string' ? value['headerName'] : '',
        headerValue: typeof value['headerValue'] === 'string' ? value['headerValue'] : '',
        bodyContains: typeof value['bodyContains'] === 'string' ? value['bodyContains'] : '',
        action,
        setHeaders: typeof value['setHeaders'] === 'string' ? value['setHeaders'] : '[]',
        removeHeaders: typeof value['removeHeaders'] === 'string' ? value['removeHeaders'] : '[]',
        setBody: typeof value['setBody'] === 'string' ? value['setBody'] : '',
        bodyMode: typeof value['bodyMode'] === 'string' ? value['bodyMode'] : 'json',
        mockStatus: typeof value['mockStatus'] === 'number' ? value['mockStatus'] : 200,
        mockBody: typeof value['mockBody'] === 'string' ? value['mockBody'] : '{\n}\n',
        activity: parseActivityEntries(value['activity']),
      };
    }),
  };
}

export function interceptRuleMatches(matchUrl: string, url: string): boolean {
  const pattern = matchUrl.trim();
  if (!pattern || pattern === '*')
    return true;
  if (pattern.endsWith('*'))
    return url.startsWith(pattern.slice(0, -1));
  return url.includes(pattern);
}

function parseActivityEntries(raw: unknown): InterceptActivityEntry[] {
  if (!Array.isArray(raw))
    return [];
  const next: InterceptActivityEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const row = item as Record<string, unknown>;
    const url = typeof row['url'] === 'string' ? row['url'] : '';
    if (!url)
      continue;
    const at =
      typeof row['at'] === 'number' && Number.isFinite(row['at'])
        ? row['at']
        : typeof row['at'] === 'string' && row['at']
          ? Date.parse(row['at']) || 0
          : 0;
    next.push({
      id: typeof row['id'] === 'string' && row['id'] ? row['id'] : newInterceptActivityId(at || Date.now()),
      at,
      method: typeof row['method'] === 'string' && row['method'] ? row['method'] : 'GET',
      url,
      status: typeof row['status'] === 'number' && Number.isFinite(row['status']) ? row['status'] : 0,
      action: typeof row['action'] === 'string' && row['action'] ? row['action'] : 'passthrough',
      requestHeaders: parseHeaderRecord(row['requestHeaders']),
      headers: parseHeaderRecord(row['headers']),
      requestBody: typeof row['requestBody'] === 'string' ? row['requestBody'] : '',
      body: typeof row['body'] === 'string' ? row['body'] : '',
    });
    if (next.length >= INTERCEPT_ACTIVITY_MAX)
      break;
  }
  return next;
}

function parseHeaderRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string')
      out[key] = value;
  }
  return out;
}

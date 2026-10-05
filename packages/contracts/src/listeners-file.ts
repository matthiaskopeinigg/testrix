import { newEntityId } from './entity-id';
import { CONFIG_SCHEMA_VERSION } from './settings';
import {
  newServiceNodeId,
  parseUnknownTree,
  type ServiceTreeNode,
} from './service-tree';

export const LISTENER_SECTIONS = ['capture'] as const;
export type ListenerSection = (typeof LISTENER_SECTIONS)[number];

export function normalizeListenerSection(raw: string | null | undefined): ListenerSection {
  if (raw === 'capture')
    return raw;
  // Legacy overview tabs land on Capture.
  return 'capture';
}

export const LISTENER_MODES = ['browser', 'device'] as const;
export type ListenerMode = (typeof LISTENER_MODES)[number];

/** Max persisted Network hits kept per listener artifact. */
export const LISTENER_ACTIVITY_MAX = 200;

/** One captured Network hit stored on the listener artifact. */
export interface ListenerActivityEntry {
  readonly id: string;
  readonly at: number;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly resourceType?: string;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly body: string;
}

export interface ListenerArtifactFields {
  readonly description: string;
  readonly tags: readonly string[];
  readonly mode: ListenerMode;
  /** Browser E2E start URL (supports {{placeholders}} and plain hostnames). */
  readonly startUrl: string;
  /** Emulator device id from Emulator sidebar. */
  readonly deviceId: string;
  readonly filterMethod: string;
  readonly filterUrl: string;
  readonly filterStatus: string;
  /**
   * Browser Network-tab style resource filter (`all`, `fetch`, `doc`, …).
   * Display filter; hits still capture every matching method/URL/status.
   */
  readonly filterResource: string;
  /** Newest-first captured Network hits (persisted in listeners.json). */
  readonly activity: readonly ListenerActivityEntry[];
}

export type ListenerNode = ServiceTreeNode<ListenerArtifactFields>;

export interface ListenersFile {
  readonly schemaVersion: number;
  readonly items: readonly ListenerNode[];
}

export const DEFAULT_LISTENERS_FILE: ListenersFile = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  items: [],
};

export function emptyListenerArtifact(name = 'New listener'): ListenerNode {
  const now = new Date().toISOString();
  return {
    kind: 'artifact',
    id: newServiceNodeId(),
    name,
    updatedAt: now,
    description: '',
    tags: [],
    mode: 'browser',
    startUrl: 'http://127.0.0.1/',
    deviceId: '',
    filterMethod: '*',
    filterUrl: '',
    filterStatus: '',
    filterResource: 'all',
    activity: [],
  };
}

export function newListenerActivityId(_now: number | string = Date.now()): string {
  return newEntityId();
}

/**
 * Prepends a hit and caps history length (newest first).
 */
export function prependListenerActivity(
  activity: readonly ListenerActivityEntry[],
  entry: ListenerActivityEntry,
): ListenerActivityEntry[] {
  const id = entry.id || newListenerActivityId(entry.at);
  const next = [{ ...entry, id }, ...activity.filter((item) => item.id !== id)];
  return next.slice(0, LISTENER_ACTIVITY_MAX);
}

export function parseListenersFile(raw: unknown): ListenersFile {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    items: parseUnknownTree(source['items'], (value) => ({
      description: typeof value['description'] === 'string' ? value['description'] : '',
      tags: Array.isArray(value['tags']) ? value['tags'].filter((item): item is string => typeof item === 'string') : [],
      mode: value['mode'] === 'device' ? 'device' : 'browser',
      startUrl: typeof value['startUrl'] === 'string' ? value['startUrl'] : 'http://127.0.0.1/',
      deviceId: typeof value['deviceId'] === 'string' ? value['deviceId'] : '',
      filterMethod: typeof value['filterMethod'] === 'string' ? value['filterMethod'] : '*',
      filterUrl: typeof value['filterUrl'] === 'string' ? value['filterUrl'] : '',
      filterStatus: typeof value['filterStatus'] === 'string' ? value['filterStatus'] : '',
      filterResource: typeof value['filterResource'] === 'string' && value['filterResource']
        ? value['filterResource']
        : 'all',
      activity: parseActivityEntries(value['activity']),
    })),
  };
}

function parseActivityEntries(raw: unknown): ListenerActivityEntry[] {
  if (!Array.isArray(raw))
    return [];
  const next: ListenerActivityEntry[] = [];
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
      id: typeof row['id'] === 'string' && row['id'] ? row['id'] : newListenerActivityId(at || Date.now()),
      at,
      method: typeof row['method'] === 'string' && row['method'] ? row['method'] : 'GET',
      url,
      status: typeof row['status'] === 'number' && Number.isFinite(row['status']) ? row['status'] : 0,
      resourceType: typeof row['resourceType'] === 'string' ? row['resourceType'] : undefined,
      requestHeaders: parseHeaderRecord(row['requestHeaders']),
      headers: parseHeaderRecord(row['headers']),
      requestBody: typeof row['requestBody'] === 'string' ? row['requestBody'] : '',
      body: typeof row['body'] === 'string' ? row['body'] : '',
    });
    if (next.length >= LISTENER_ACTIVITY_MAX)
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

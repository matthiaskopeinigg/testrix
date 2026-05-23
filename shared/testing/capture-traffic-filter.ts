import type { CaptureLogEntry } from './capture-log-entry.schema';

export type CaptureTrafficFilterScope = 'all' | 'url' | 'path' | 'method' | 'status' | 'type';

export type CaptureResourceCategory =
  | 'all'
  | 'fetch-xhr'
  | 'document'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'font'
  | 'media'
  | 'manifest'
  | 'websocket'
  | 'other';

export const CAPTURE_TRAFFIC_FILTER_SCOPE_IDS = [
  'all',
  'url',
  'path',
  'method',
  'status',
  'type',
] as const satisfies readonly CaptureTrafficFilterScope[];

export const CAPTURE_RESOURCE_CATEGORY_IDS = [
  'all',
  'fetch-xhr',
  'document',
  'stylesheet',
  'script',
  'image',
  'font',
  'media',
  'manifest',
  'websocket',
  'other',
] as const satisfies readonly CaptureResourceCategory[];

const NON_OTHER_RESOURCE_TYPES = new Set([
  'xhr',
  'mainframe',
  'subframe',
  'stylesheet',
  'script',
  'image',
  'font',
  'media',
  'manifest',
  'websocket',
]);

function normalizeResourceType(rt: string | undefined): string {
  return (rt ?? '').trim().toLowerCase();
}

/**
 * Returns true when an entry matches the DevTools-style resource category filter.
 */
export function entryMatchesCaptureResourceCategory(
  entry: CaptureLogEntry,
  category: CaptureResourceCategory,
): boolean {
  if (category === 'all') {
    return true;
  }
  const t = normalizeResourceType(entry.resourceType);
  if (category === 'other') {
    return !NON_OTHER_RESOURCE_TYPES.has(t);
  }
  switch (category) {
    case 'fetch-xhr':
      return t === 'xhr';
    case 'document':
      return t === 'mainframe' || t === 'subframe';
    case 'stylesheet':
      return t === 'stylesheet';
    case 'script':
      return t === 'script';
    case 'image':
      return t === 'image';
    case 'font':
      return t === 'font';
    case 'media':
      return t === 'media';
    case 'manifest':
      return t === 'manifest';
    case 'websocket':
      return t === 'websocket';
    default:
      return true;
  }
}

function capturePathAndQuery(url: string): string {
  if (!url) {
    return '';
  }
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const i = url.indexOf('://');
    if (i !== -1) {
      const rest = url.slice(i + 3);
      const slash = rest.indexOf('/');
      return slash === -1 ? '/' : rest.slice(slash);
    }
    return url;
  }
}

function haystackForScope(entry: CaptureLogEntry, scope: CaptureTrafficFilterScope): string {
  switch (scope) {
    case 'url':
      return entry.url.toLowerCase();
    case 'path':
      return capturePathAndQuery(entry.url).toLowerCase();
    case 'method':
      return entry.method.toLowerCase();
    case 'status':
      return String(entry.statusCode ?? '').toLowerCase();
    case 'type':
      return normalizeResourceType(entry.resourceType);
    case 'all':
    default:
      return [
        entry.url,
        capturePathAndQuery(entry.url),
        entry.method,
        String(entry.statusCode ?? ''),
        entry.resourceType ?? '',
      ]
        .join('\n')
        .toLowerCase();
  }
}

/**
 * Filters capture log entries by text query, resource category, and field scope.
 */
export function filterCaptureLogEntries(
  entries: readonly CaptureLogEntry[],
  options: {
    readonly query: string;
    readonly scope: CaptureTrafficFilterScope;
    readonly resourceCategory: CaptureResourceCategory;
  },
): CaptureLogEntry[] {
  const q = options.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (!entryMatchesCaptureResourceCategory(entry, options.resourceCategory)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return haystackForScope(entry, options.scope).includes(q);
  });
}

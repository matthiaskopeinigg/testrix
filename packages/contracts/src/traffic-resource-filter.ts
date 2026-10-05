export interface TrafficResourceEntry {
  readonly method: string;
  readonly url: string;
  /** CDP Network ResourceType when captured (Document, XHR, Script, …). */
  readonly resourceType?: string;
  readonly responseHeaders: readonly { readonly key: string; readonly value: string }[];
}

export const TRAFFIC_RESOURCE_FILTERS = [
  'all',
  'fetch',
  'doc',
  'css',
  'js',
  'font',
  'img',
  'media',
  'manifest',
  'ws',
  'wasm',
  'other',
] as const;

export type TrafficResourceFilter = (typeof TRAFFIC_RESOURCE_FILTERS)[number];

export const TRAFFIC_RESOURCE_FILTER_OPTIONS: readonly {
  readonly value: TrafficResourceFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'fetch', label: 'Fetch / XHR' },
  { value: 'doc', label: 'Doc' },
  { value: 'css', label: 'CSS' },
  { value: 'js', label: 'JS' },
  { value: 'font', label: 'Font' },
  { value: 'img', label: 'Img' },
  { value: 'media', label: 'Media' },
  { value: 'manifest', label: 'Manifest' },
  { value: 'ws', label: 'WS' },
  { value: 'wasm', label: 'Wasm' },
  { value: 'other', label: 'Other' },
];

/**
 * Maps a CDP resource type, Content-Type, and URL onto a Chrome-style Network filter.
 */
export function classifyTrafficResource(
  entry: Pick<TrafficResourceEntry, 'method' | 'url' | 'resourceType' | 'responseHeaders'>,
): Exclude<TrafficResourceFilter, 'all'> {
  if (looksLikeWasm(entry))
    return 'wasm';
  const fromType = classifyCdpResourceType(entry.resourceType);
  if (fromType)
    return fromType;
  const fromMime = classifyMime(headerValue(entry.responseHeaders, 'content-type'));
  if (fromMime)
    return fromMime;
  const fromUrl = classifyUrl(entry.url);
  if (fromUrl)
    return fromUrl;
  if (entry.method.toUpperCase() === 'OPTIONS')
    return 'fetch';
  return 'other';
}

function classifyCdpResourceType(raw: string | undefined): Exclude<TrafficResourceFilter, 'all'> | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'document':
      return 'doc';
    case 'stylesheet':
      return 'css';
    case 'script':
      return 'js';
    case 'image':
      return 'img';
    case 'media':
      return 'media';
    case 'font':
      return 'font';
    case 'xhr':
    case 'fetch':
    case 'preflight':
    case 'eventsource':
    case 'prefetch':
      return 'fetch';
    case 'websocket':
      return 'ws';
    case 'manifest':
      return 'manifest';
    case 'wasm':
    case 'webassembly':
      return 'wasm';
    default:
      return null;
  }
}

function classifyMime(contentType: string): Exclude<TrafficResourceFilter, 'all'> | null {
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mime)
    return null;
  if (mime === 'text/html' || mime === 'application/xhtml+xml')
    return 'doc';
  if (mime === 'text/css')
    return 'css';
  if (mime.includes('javascript') || mime.includes('ecmascript'))
    return 'js';
  if (mime.startsWith('font/') || mime.includes('woff') || mime.includes('opentype') || mime.includes('truetype'))
    return 'font';
  if (mime.startsWith('image/'))
    return 'img';
  if (mime.startsWith('audio/') || mime.startsWith('video/'))
    return 'media';
  if (mime === 'application/manifest+json')
    return 'manifest';
  if (mime === 'application/wasm')
    return 'wasm';
  if (
    mime === 'application/json' ||
    mime.endsWith('+json') ||
    mime === 'application/x-www-form-urlencoded' ||
    mime === 'multipart/form-data' ||
    mime === 'text/event-stream'
  )
    return 'fetch';
  return null;
}

function classifyUrl(url: string): Exclude<TrafficResourceFilter, 'all'> | null {
  let pathname = url.toLowerCase();
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    const cut = pathname.split('?')[0] ?? pathname;
    pathname = cut;
  }
  if (pathname.endsWith('.webmanifest') || pathname.endsWith('/manifest.json'))
    return 'manifest';
  if (pathname.endsWith('.wasm'))
    return 'wasm';
  if (/\.(?:html?|xhtml)$/.test(pathname))
    return 'doc';
  if (pathname.endsWith('.css'))
    return 'css';
  if (/\.(?:m?js|cjs)$/.test(pathname))
    return 'js';
  if (/\.(?:woff2?|ttf|otf|eot)$/.test(pathname))
    return 'font';
  if (/\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp)$/.test(pathname))
    return 'img';
  if (/\.(?:mp4|webm|mp3|wav|m4a|ogg|ogv)$/.test(pathname))
    return 'media';
  return null;
}

function looksLikeWasm(
  entry: Pick<TrafficResourceEntry, 'url' | 'resourceType' | 'responseHeaders'>,
): boolean {
  if (classifyCdpResourceType(entry.resourceType) === 'wasm')
    return true;
  const mime = headerValue(entry.responseHeaders, 'content-type');
  if (classifyMime(mime) === 'wasm')
    return true;
  return classifyUrl(entry.url) === 'wasm';
}

function headerValue(
  headers: readonly { readonly key: string; readonly value: string }[] | undefined,
  name: string,
): string {
  const needle = name.toLowerCase();
  for (const row of headers ?? []) {
    if (row.key.toLowerCase() === needle)
      return row.value;
  }
  return '';
}

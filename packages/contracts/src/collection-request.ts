import { z } from 'zod';

import {
  collectionFolderAuthSchema,
  collectionFolderScriptsSchema,
  collectionFolderSettingsSchema,
  collectionKvRowSchema,
  emptyCollectionKvRow,
  type CollectionFolderAuth,
  type CollectionFolderSettings,
  type CollectionKvRow,
} from './collection-folder';

const requestHttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export const REQUEST_BODY_MODES = [
  'none',
  'json',
  'text',
  'html',
  'xml',
  'form-data',
  'urlencoded',
  'binary',
  'graphql',
] as const;

export const requestBodyModeSchema = z.enum(REQUEST_BODY_MODES);

export type RequestBodyMode = z.infer<typeof requestBodyModeSchema>;

export const requestFormPartKindSchema = z.enum(['text', 'file']);

export type RequestFormPartKind = z.infer<typeof requestFormPartKindSchema>;

export const requestFormRowSchema = collectionKvRowSchema.extend({
  kind: requestFormPartKindSchema.default('text'),
  fileName: z.string().default(''),
  contentType: z.string().default(''),
});

export type RequestFormRow = z.infer<typeof requestFormRowSchema>;

export const requestGraphqlBodySchema = z.object({
  query: z.string().default(''),
  variables: z.string().default('{\n}\n'),
  operationName: z.string().default(''),
});

export type RequestGraphqlBody = z.infer<typeof requestGraphqlBodySchema>;

export const requestBinaryBodySchema = z.object({
  fileName: z.string().default(''),
  contentType: z.string().default('application/octet-stream'),
  base64: z.string().default(''),
});

export type RequestBinaryBody = z.infer<typeof requestBinaryBodySchema>;

export const requestBodySchema = z.object({
  mode: requestBodyModeSchema.default('none'),
  text: z.string().default(''),
  graphql: requestGraphqlBodySchema.default(() => requestGraphqlBodySchema.parse({})),
  formRows: z.array(requestFormRowSchema).default([]),
  binary: requestBinaryBodySchema.default(() => requestBinaryBodySchema.parse({})),
});

export type RequestBody = z.infer<typeof requestBodySchema>;

export const requestAuthModeSchema = z.enum([
  'inherit',
  'none',
  'bearer',
  'basic',
  'apikey',
  'digest',
  'oauth2',
]);

export type RequestAuthMode = z.infer<typeof requestAuthModeSchema>;

export const REQUEST_AUTH_MODES = requestAuthModeSchema.options;

export const REQUEST_TAB_SECTIONS = [
  'overview',
  'params',
  'headers',
  'body',
  'auth',
  'scripts',
  'settings',
  'docs',
] as const;

export const requestTabSectionSchema = z.enum(REQUEST_TAB_SECTIONS);

export type RequestTabSection = z.infer<typeof requestTabSectionSchema>;

export const REQUEST_RESPONSE_TABS = [
  'pretty',
  'raw',
  'preview',
  'headers',
  'cookies',
  'timeline',
  'redirects',
  'diff',
  'runs',
] as const;

export const requestResponseTabSchema = z.enum(REQUEST_RESPONSE_TABS);

export type RequestResponseTab = z.infer<typeof requestResponseTabSchema>;

export const requestExampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  at: z.string().min(1),
  method: requestHttpMethodSchema,
  url: z.string().default(''),
  status: z.number().int(),
  statusText: z.string().default(''),
  durationMs: z.number().default(0),
  sizeLabel: z.string().default(''),
  headers: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  body: z.string().default(''),
});

export type RequestExample = z.infer<typeof requestExampleSchema>;

export const collectionRequestConfigSchema = z.object({
  url: z.string().default(''),
  pathParams: z.array(collectionKvRowSchema).default([]),
  queryParams: z.array(collectionKvRowSchema).default([]),
  headers: z.array(collectionKvRowSchema).default([]),
  authMode: requestAuthModeSchema.default('inherit'),
  auth: collectionFolderAuthSchema.default(() => collectionFolderAuthSchema.parse({})),
  body: requestBodySchema.default(() => requestBodySchema.parse({})),
  scripts: collectionFolderScriptsSchema.default(() => collectionFolderScriptsSchema.parse({})),
  settings: collectionFolderSettingsSchema.partial().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  docs: z.string().default(''),
  examples: z.array(requestExampleSchema).default([]),
});

export type CollectionRequestConfig = z.infer<typeof collectionRequestConfigSchema>;

export const DEFAULT_REQUEST_BODY: RequestBody = requestBodySchema.parse({});
export const DEFAULT_REQUEST_CONFIG: CollectionRequestConfig = collectionRequestConfigSchema.parse({});

export function parseCollectionRequestConfig(raw: unknown): CollectionRequestConfig {
  const parsed = collectionRequestConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_REQUEST_CONFIG };
}

export function requestConfigOf(node: { readonly config?: unknown }): CollectionRequestConfig {
  return parseCollectionRequestConfig(node.config ?? {});
}

export function emptyFormRow(prefix = 'form'): RequestFormRow {
  return requestFormRowSchema.parse({
    ...emptyCollectionKvRow(prefix),
    kind: 'text',
  });
}

export function mergeRequestSettings(
  folder: CollectionFolderSettings,
  override: Partial<CollectionFolderSettings> | undefined,
): CollectionFolderSettings {
  if (!override)
    return folder;
  return {
    followRedirects: override.followRedirects ?? folder.followRedirects,
    verifyTlsInherit: override.verifyTlsInherit ?? folder.verifyTlsInherit,
    verifyTls: override.verifyTls ?? folder.verifyTls,
    sendCookies: override.sendCookies ?? folder.sendCookies,
    storeCookies: override.storeCookies ?? folder.storeCookies,
    timeoutMs: override.timeoutMs ?? folder.timeoutMs,
    cookies: override.cookies ?? folder.cookies,
  };
}

export function contentTypeForBody(mode: RequestBodyMode): string | null {
  switch (mode) {
    case 'json':
    case 'graphql':
      return 'application/json';
    case 'html':
      return 'text/html';
    case 'xml':
      return 'application/xml';
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'text':
      return 'text/plain';
    default:
      return null;
  }
}

function decodeBase64(value: string): string {
  if (!value)
    return '';
  try {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1)
      bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

export function encodeRequestBody(body: RequestBody): { readonly text: string; readonly contentType: string | null } {
  const mode = body.mode;
  if (mode === 'none')
    return { text: '', contentType: null };
  if (mode === 'form-data') {
    const boundary = '----TestrixFormBoundary';
    const chunks: string[] = [];
    for (const row of body.formRows) {
      if (!row.enabled || !row.key.trim())
        continue;
      if (row.kind === 'file') {
        chunks.push(
          `--${boundary}\r\nContent-Disposition: form-data; name="${row.key}"; filename="${row.fileName || 'file'}"\r\nContent-Type: ${row.contentType || 'application/octet-stream'}\r\n\r\n${row.value}\r\n`,
        );
        continue;
      }
      chunks.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${row.key}"\r\n\r\n${row.value}\r\n`,
      );
    }
    chunks.push(`--${boundary}--\r\n`);
    return { text: chunks.join(''), contentType: `multipart/form-data; boundary=${boundary}` };
  }
  if (mode === 'urlencoded') {
    const text = body.formRows
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => `${encodeURIComponent(row.key.trim())}=${encodeURIComponent(row.value)}`)
      .join('&');
    return { text, contentType: 'application/x-www-form-urlencoded' };
  }
  if (mode === 'graphql') {
    const payload: Record<string, unknown> = { query: body.graphql.query };
    if (body.graphql.operationName.trim())
      payload['operationName'] = body.graphql.operationName.trim();
    try {
      payload['variables'] = JSON.parse(body.graphql.variables || '{}');
    } catch {
      payload['variables'] = {};
    }
    return { text: JSON.stringify(payload), contentType: 'application/json' };
  }
  if (mode === 'binary') {
    return {
      text: decodeBase64(body.binary.base64),
      contentType: body.binary.contentType || 'application/octet-stream',
    };
  }
  return { text: body.text, contentType: contentTypeForBody(mode) };
}

const PATH_PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;

export function pathParamNames(url: string): string[] {
  const path = url.split('?')[0] ?? url;
  const names: string[] = [];
  const seen = new Set<string>();
  PATH_PARAM_RE.lastIndex = 0;
  let match = PATH_PARAM_RE.exec(path);
  while (match) {
    const name = match[1] ?? '';
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
    match = PATH_PARAM_RE.exec(path);
  }
  return names;
}

export function applyPathParams(url: string, params: readonly CollectionKvRow[]): string {
  const values = new Map(
    params.filter((row) => row.enabled && row.key.trim()).map((row) => [row.key.trim(), row.value]),
  );
  const [pathPart = '', ...queryParts] = url.split('?');
  const nextPath = pathPart.replace(PATH_PARAM_RE, (full, name: string) => {
    const value = values.get(name);
    return value === undefined || value === '' ? full : encodeURIComponent(value);
  });
  return queryParts.length > 0 ? `${nextPath}?${queryParts.join('?')}` : nextPath;
}

export function parseQueryParams(url: string): CollectionKvRow[] {
  const index = url.indexOf('?');
  if (index < 0)
    return [];
  const search = url.slice(index + 1);
  if (!search.trim())
    return [];
  const params = new URLSearchParams(search);
  const rows: CollectionKvRow[] = [];
  params.forEach((value, key) => {
    rows.push({
      id: `query_${key}_${rows.length}`,
      enabled: true,
      key,
      value,
      description: '',
    });
  });
  return rows;
}

export function syncPathParams(
  url: string,
  current: readonly CollectionKvRow[],
): CollectionKvRow[] {
  const names = pathParamNames(url);
  const byKey = new Map(current.map((row) => [row.key.trim(), row]));
  return names.map((name) => {
    const existing = byKey.get(name);
    if (existing)
      return existing;
    return { id: `path_${name}`, enabled: true, key: name, value: '', description: '' };
  });
}

export function applyQueryToUrl(url: string, params: readonly CollectionKvRow[]): string {
  const base = (url.split('?')[0] ?? url).trim();
  const enabled = params.filter((row) => row.enabled && row.key.trim());
  if (enabled.length === 0)
    return base;
  const search = enabled
    .map((row) => `${encodeURIComponent(row.key.trim())}=${encodeURIComponent(row.value)}`)
    .join('&');
  return `${base}?${search}`;
}

export function requestSectionSlideDir(
  from: RequestTabSection,
  to: RequestTabSection,
): 'left' | 'right' {
  return REQUEST_TAB_SECTIONS.indexOf(to) > REQUEST_TAB_SECTIONS.indexOf(from) ? 'right' : 'left';
}

export function requestResponseTabSlideDir(
  from: RequestResponseTab,
  to: RequestResponseTab,
): 'left' | 'right' {
  return REQUEST_RESPONSE_TABS.indexOf(to) > REQUEST_RESPONSE_TABS.indexOf(from) ? 'right' : 'left';
}

export function looksLikeCurl(text: string): boolean {
  return /^curl(\s|$)/i.test(text.trim());
}

export function parseCurl(raw: string): {
  readonly method: z.infer<typeof requestHttpMethodSchema>;
  readonly url: string;
  readonly headers: CollectionKvRow[];
  readonly body: string;
} | null {
  const text = raw.trim();
  if (!looksLikeCurl(text))
    return null;
  const tokens = tokenizeCurl(text);
  let method: z.infer<typeof requestHttpMethodSchema> = 'GET';
  let url = '';
  const headers: CollectionKvRow[] = [];
  let body = '';
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    if (token === '-X' || token === '--request') {
      const next = (tokens[index + 1] ?? 'GET').toUpperCase();
      if (
        next === 'POST' ||
        next === 'PUT' ||
        next === 'PATCH' ||
        next === 'DELETE' ||
        next === 'HEAD' ||
        next === 'OPTIONS' ||
        next === 'GET'
      )
        method = next;
      index += 1;
      continue;
    }
    if (token === '-H' || token === '--header') {
      const header = tokens[index + 1] ?? '';
      const split = header.indexOf(':');
      headers.push({
        id: `curl_h_${headers.length}`,
        enabled: true,
        key: split >= 0 ? header.slice(0, split).trim() : header.trim(),
        value: split >= 0 ? header.slice(split + 1).trim() : '',
        description: '',
      });
      index += 1;
      continue;
    }
    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      body = tokens[index + 1] ?? '';
      if (method === 'GET')
        method = 'POST';
      index += 1;
      continue;
    }
    if (token.startsWith('-'))
      continue;
    if (!url)
      url = token.replace(/^['"]|['"]$/g, '');
  }
  return { method, url, headers, body };
}

function tokenizeCurl(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (quote) {
      if (char === '\\' && quote === '"') {
        current += text[index + 1] ?? '';
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        out.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current)
    out.push(current);
  return out;
}

export function snippetFor(
  language: 'curl' | 'fetch' | 'httpie',
  input: {
    readonly method: string;
    readonly url: string;
    readonly headers: readonly { readonly key: string; readonly value: string }[];
    readonly body: string;
  },
): string {
  const method = input.method.toUpperCase();
  const headers = input.headers.filter((row) => row.key.trim());
  if (language === 'httpie') {
    const headerFlags = headers.map((row) => `${row.key}:'${escapeSingle(row.value)}'`).join(' ');
    const body = input.body.trim() ? ` <<< '${escapeSingle(input.body)}'` : '';
    return `http ${method} ${input.url}${headerFlags ? ` ${headerFlags}` : ''}${body}`;
  }
  if (language === 'fetch') {
    const headerLines = headers
      .map((row) => `    '${escapeSingle(row.key)}': '${escapeSingle(row.value)}'`)
      .join(',\n');
    const bodyLine = input.body.trim() ? `,\n  body: ${JSON.stringify(input.body)}` : '';
    return `await fetch('${escapeSingle(input.url)}', {\n  method: '${method}',\n  headers: {\n${headerLines}\n  }${bodyLine}\n});`;
  }
  const parts = [`curl -X ${method} '${escapeSingle(input.url)}'`];
  for (const row of headers)
    parts.push(`  -H '${escapeSingle(row.key)}: ${escapeSingle(row.value)}'`);
  if (input.body.trim())
    parts.push(`  --data-raw '${escapeSingle(input.body)}'`);
  return parts.join(' \\\n');
}

function escapeSingle(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

export function resolvedAuth(
  mode: RequestAuthMode,
  requestAuth: CollectionFolderAuth,
  folderAuth: CollectionFolderAuth,
): CollectionFolderAuth {
  if (mode === 'inherit')
    return folderAuth;
  return { ...requestAuth, type: mode === 'none' ? 'none' : mode };
}

export function prettyBody(raw: string, contentType = ''): string {
  const type = contentType.toLowerCase();
  const trimmed = raw.trim();
  if (!trimmed)
    return raw;
  if (type.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function cookiesFromSetCookie(
  headers: readonly { readonly key: string; readonly value: string }[],
): readonly { readonly name: string; readonly value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const header of headers) {
    if (header.key.toLowerCase() !== 'set-cookie')
      continue;
    const pair = header.value.split(';')[0] ?? '';
    const split = pair.indexOf('=');
    if (split < 0)
      continue;
    out.push({ name: pair.slice(0, split).trim(), value: pair.slice(split + 1).trim() });
  }
  return out;
}

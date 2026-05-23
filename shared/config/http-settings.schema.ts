import { z } from 'zod';

import type { RequestResponseTabId } from './request-runs-session.schema';

export const HTTP_METHOD_IDS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

export type HttpMethodId = (typeof HTTP_METHOD_IDS)[number];

const HTTP_METHODS_WITHOUT_BODY = new Set<HttpMethodId>(['GET', 'HEAD']);

/** Whether the HTTP method may include a request body on send. */
export function httpMethodAllowsRequestBody(method: HttpMethodId): boolean {
  return !HTTP_METHODS_WITHOUT_BODY.has(method);
}

export const HTTP_URL_SCHEME_IDS = ['http', 'https'] as const;

export type HttpUrlSchemeId = (typeof HTTP_URL_SCHEME_IDS)[number];

export const HTTP_REQUEST_SECTION_IDS = [
  'overview',
  'params',
  'auth',
  'headers',
  'body',
  'scripts',
  'settings',
  'docs',
  'response',
] as const;

const LEGACY_HTTP_REQUEST_SECTION_IDS = [
  'params',
  'auth',
  'headers',
  'body',
  'scripts',
  'settings',
] as const;

/** Coerces persisted section id (including legacy values) to a valid section. */
export function coerceHttpRequestSectionId(value: unknown): HttpRequestSectionId {
  if (
    typeof value === 'string' &&
    (HTTP_REQUEST_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as HttpRequestSectionId;
  }
  if (
    typeof value === 'string' &&
    (LEGACY_HTTP_REQUEST_SECTION_IDS as readonly string[]).includes(value)
  ) {
    return value as HttpRequestSectionId;
  }
  return DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN;
}

/** Coerces persisted URL scheme to a supported default. */
export function coerceHttpUrlScheme(value: unknown, fallback: HttpUrlSchemeId = 'https'): HttpUrlSchemeId {
  return value === 'http' || value === 'https' ? value : fallback;
}

export type HttpRequestSectionId = (typeof HTTP_REQUEST_SECTION_IDS)[number];

/** Default request sidebar section for new tabs and when settings omit a value. */
export const DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN = 'overview' as const satisfies HttpRequestSectionId;

/** Response sub-tabs offered as the global default after send (Settings → HTTP → Request). */
export const HTTP_RESPONSE_TAB_ON_SEND_IDS = [
  'body',
  'raw',
  'headers',
  'timeline',
  'preview',
  'diff',
] as const satisfies readonly RequestResponseTabId[];

export type HttpResponseTabOnSendId = (typeof HTTP_RESPONSE_TAB_ON_SEND_IDS)[number];

export const DEFAULT_HTTP_RESPONSE_TAB_ON_SEND: HttpResponseTabOnSendId = 'body';

/** Coerces persisted default response tab (invalid values fall back to Pretty). */
export function coerceHttpResponseTabOnSend(value: unknown): HttpResponseTabOnSendId {
  if (
    typeof value === 'string' &&
    (HTTP_RESPONSE_TAB_ON_SEND_IDS as readonly string[]).includes(value)
  ) {
    return value as HttpResponseTabOnSendId;
  }
  return DEFAULT_HTTP_RESPONSE_TAB_ON_SEND;
}

export const httpKeyValueRowSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  key: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export type HttpKeyValueRow = z.infer<typeof httpKeyValueRowSchema>;

export const httpRequestSettingsSchema = z.object({
  defaultMethod: z.enum(HTTP_METHOD_IDS),
  activeSectionOnOpen: z.enum(HTTP_REQUEST_SECTION_IDS),
  /** Response sub-tab when a send completes and the current tab is unavailable. */
  defaultResponseTabOnSend: z.enum(HTTP_RESPONSE_TAB_ON_SEND_IDS),
  /** Scheme prepended when the request URL has no `http://` or `https://`. */
  defaultUrlScheme: z.enum(HTTP_URL_SCHEME_IDS),
  /** When true, normalizes the outgoing URL on send (scheme, optional `www.`). */
  autoFixUrlOnSend: z.boolean(),
  /** When auto-fix is on, prepend `www.` to bare domains such as `google.at`. */
  prependWwwOnSend: z.boolean(),
  /** When true, adds `Content-Type` on send from body mode and payload shape when not set manually. */
  autoDetectContentTypeOnSend: z.boolean(),
  timeoutMs: z.number().int().min(0).max(600_000),
  useCookies: z.boolean(),
  http2Enabled: z.boolean(),
  http2FallbackToHttp1: z.boolean(),
  followRedirects: z.boolean(),
  maxRedirects: z.number().int().min(0).max(50),
  strictSsl: z.boolean(),
  disableCookiesGlobally: z.boolean(),
});

export type HttpRequestSettings = z.infer<typeof httpRequestSettingsSchema>;

export const httpRetriesSettingsSchema = z.object({
  enabled: z.boolean(),
  maxAttempts: z.number().int().min(0).max(10),
  delayMs: z.number().int().min(0).max(60_000),
  exponentialBackoff: z.boolean(),
  backoffMultiplier: z.number().min(1).max(10),
  maxDelayMs: z.number().int().min(0).max(600_000),
});

export type HttpRetriesSettings = z.infer<typeof httpRetriesSettingsSchema>;

export const httpTestingSettingsSchema = z.object({
  e2eScreenshotFolder: z.string(),
});

export type HttpTestingSettings = z.infer<typeof httpTestingSettingsSchema>;

export const httpHeadersSettingsSchema = z.object({
  applyDefaultHeaders: z.boolean(),
  rows: z.array(httpKeyValueRowSchema).max(32),
});

export type HttpHeadersSettings = z.infer<typeof httpHeadersSettingsSchema>;

export const HTTP_CERTIFICATE_ENTRY_MAX = 32;

export const httpClientCertificateEntrySchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  /** Hostname or glob (`*.example.com`) for mutual TLS. */
  hostPattern: z.string().max(253),
  clientCertPath: z.string().nullable(),
  clientKeyPath: z.string().nullable(),
  pfxPath: z.string().nullable(),
  passphrase: z.string().max(512),
});

export type HttpClientCertificateEntry = z.infer<typeof httpClientCertificateEntrySchema>;

export const httpCertificatesSettingsSchema = z.object({
  ignoreInvalidSsl: z.boolean(),
  verifyHostname: z.boolean(),
  caCertPath: z.string().nullable(),
  entries: z.array(httpClientCertificateEntrySchema).max(HTTP_CERTIFICATE_ENTRY_MAX),
});

export type HttpCertificatesSettings = z.infer<typeof httpCertificatesSettingsSchema>;

export const httpDnsSettingsSchema = z.object({
  overrideEnabled: z.boolean(),
  servers: z.string(),
  hosts: z.array(httpKeyValueRowSchema).max(32),
});

export type HttpDnsSettings = z.infer<typeof httpDnsSettingsSchema>;

export const httpProxySettingsSchema = z.object({
  enabled: z.boolean(),
  httpProxy: z.string(),
  httpsProxy: z.string(),
  bypass: z.string(),
});

export type HttpProxySettings = z.infer<typeof httpProxySettingsSchema>;

export const httpSettingsSchema = z.object({
  request: httpRequestSettingsSchema,
  retries: httpRetriesSettingsSchema,
  testing: httpTestingSettingsSchema,
  headers: httpHeadersSettingsSchema,
  certificates: httpCertificatesSettingsSchema,
  dns: httpDnsSettingsSchema,
  proxy: httpProxySettingsSchema,
});

export type HttpSettings = z.infer<typeof httpSettingsSchema>;

export const httpSettingsPatchSchema = z.object({
  request: httpRequestSettingsSchema.partial().optional(),
  retries: httpRetriesSettingsSchema.partial().optional(),
  testing: httpTestingSettingsSchema.partial().optional(),
  headers: httpHeadersSettingsSchema.partial().optional(),
  certificates: httpCertificatesSettingsSchema.partial().optional(),
  dns: httpDnsSettingsSchema.partial().optional(),
  proxy: httpProxySettingsSchema.partial().optional(),
});

export type HttpSettingsPatch = z.infer<typeof httpSettingsPatchSchema>;

export const HTTP_USER_AGENT_PRODUCT = 'Testrix';

const DEFAULT_HTTP_HEADER_DEFS: readonly {
  readonly key: string;
  readonly value: string | ((appVersion: string) => string);
}[] = [
  { key: 'User-Agent', value: (appVersion) => formatHttpUserAgent(appVersion) },
  { key: 'Accept', value: '*/*' },
  { key: 'Accept-Encoding', value: 'gzip, deflate, br' },
  { key: 'Connection', value: 'keep-alive' },
];

/** Builds `User-Agent: Testrix/<version>`. */
export function formatHttpUserAgent(appVersion: string): string {
  const version = appVersion.trim() || '0.0.0';
  return `${HTTP_USER_AGENT_PRODUCT}/${version}`;
}

/** True when the value is an app-owned User-Agent (safe to refresh version). */
export function isTestrixUserAgentValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === HTTP_USER_AGENT_PRODUCT || trimmed.startsWith(`${HTTP_USER_AGENT_PRODUCT}/`);
}

/** Default outbound header rows for new installs and migration backfill. */
export function createDefaultHttpHeaderRows(appVersion = '0.0.0'): HttpKeyValueRow[] {
  return DEFAULT_HTTP_HEADER_DEFS.map((def) =>
    createHttpKeyValueRow({
      key: def.key,
      value: typeof def.value === 'function' ? def.value(appVersion) : def.value,
    }),
  );
}

/** Adds missing common headers; refreshes Testrix User-Agent to the current app version. */
export function ensureDefaultHttpHeaderRows(
  rows: readonly HttpKeyValueRow[],
  appVersion: string,
): HttpKeyValueRow[] {
  const existing = new Set(rows.map((row) => row.key.toLowerCase()));
  const appended: HttpKeyValueRow[] = [];

  for (const def of DEFAULT_HTTP_HEADER_DEFS) {
    const keyLower = def.key.toLowerCase();
    if (existing.has(keyLower)) {
      continue;
    }
    appended.push(
      createHttpKeyValueRow({
        key: def.key,
        value: typeof def.value === 'function' ? def.value(appVersion) : def.value,
      }),
    );
    existing.add(keyLower);
  }

  return syncHttpUserAgentVersion([...rows, ...appended], appVersion);
}

export function syncHttpUserAgentVersion(
  rows: readonly HttpKeyValueRow[],
  appVersion: string,
): HttpKeyValueRow[] {
  return rows.map((row) => {
    if (row.key.toLowerCase() !== 'user-agent' || !isTestrixUserAgentValue(row.value)) {
      return row;
    }
    return { ...row, value: formatHttpUserAgent(appVersion) };
  });
}

export function httpHeaderRowsEqual(
  a: readonly HttpKeyValueRow[],
  b: readonly HttpKeyValueRow[],
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((row, index) => {
    const other = b[index];
    return (
      other != null &&
      row.id === other.id &&
      row.enabled === other.enabled &&
      row.key === other.key &&
      row.value === other.value
    );
  });
}

export function enrichHttpHeadersSettings(
  headers: HttpHeadersSettings,
  appVersion: string,
): HttpHeadersSettings {
  const rows = ensureDefaultHttpHeaderRows(headers.rows, appVersion);
  if (httpHeaderRowsEqual(headers.rows, rows)) {
    return headers;
  }
  return { ...headers, rows };
}

/** Creates a client certificate row with a stable id. */
export function createHttpClientCertificateEntry(
  partial?: Partial<
      Pick<
      HttpClientCertificateEntry,
      | 'enabled'
      | 'hostPattern'
      | 'clientCertPath'
      | 'clientKeyPath'
      | 'pfxPath'
      | 'passphrase'
    >
  >,
): HttpClientCertificateEntry {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `cert-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    enabled: partial?.enabled ?? true,
    hostPattern: partial?.hostPattern ?? '',
    clientCertPath: partial?.clientCertPath ?? null,
    clientKeyPath: partial?.clientKeyPath ?? null,
    pfxPath: partial?.pfxPath ?? null,
    passphrase: partial?.passphrase ?? '',
  };
}

/**
 * Returns true when `hostname` matches `pattern`.
 * Supports globs (`*`, `?`), empty/`*` (all hosts), and `/body/flags` regex literals.
 */
export function matchesCertificateHostPattern(pattern: string, hostname: string): boolean {
  const pat = pattern.trim();
  if (pat === '' || pat === '*') {
    return true;
  }

  const host = hostname.trim().toLowerCase();
  if (!host) {
    return false;
  }

  if (pat.startsWith('/') && pat.length > 2) {
    const lastSlash = pat.lastIndexOf('/');
    if (lastSlash > 0) {
      const body = pat.slice(1, lastSlash);
      const flags = pat.slice(lastSlash + 1);
      try {
        return new RegExp(body, flags).test(host);
      } catch {
        return false;
      }
    }
  }

  const glob = pat.toLowerCase();
  const regexBody = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regexBody}$`, 'i').test(host);
}

/** Merges legacy single-path certificate fields into `entries`. */
export function normalizeHttpCertificatesSettings(raw: unknown): HttpCertificatesSettings {
  const defaults = createDefaultHttpSettings().certificates;
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }

  const record = raw as Record<string, unknown>;

  let ignoreInvalidSsl = defaults.ignoreInvalidSsl;
  let verifyHostname = defaults.verifyHostname;
  if (typeof record['ignoreInvalidSsl'] === 'boolean') {
    ignoreInvalidSsl = record['ignoreInvalidSsl'];
  } else if (typeof record['strictSsl'] === 'boolean') {
    ignoreInvalidSsl = !record['strictSsl'];
    verifyHostname = record['strictSsl'];
  }
  if (typeof record['verifyHostname'] === 'boolean') {
    verifyHostname = record['verifyHostname'];
  }

  const caCertPath =
    record['caCertPath'] === null || typeof record['caCertPath'] === 'string'
      ? (record['caCertPath'] as string | null)
      : defaults.caCertPath;

  let entries: HttpClientCertificateEntry[] = [];
  if (Array.isArray(record['entries'])) {
    const withPfx = record['entries'].map((item) => {
      if (typeof item !== 'object' || item === null) {
        return item;
      }
      const row = item as Record<string, unknown>;
      return { ...row, pfxPath: row['pfxPath'] ?? null };
    });
    const parsed = z.array(httpClientCertificateEntrySchema).safeParse(withPfx);
    if (parsed.success) {
      entries = parsed.data;
    }
  }

  const legacyCert =
    record['clientCertPath'] === null || typeof record['clientCertPath'] === 'string'
      ? (record['clientCertPath'] as string | null)
      : null;
  const legacyKey =
    record['clientKeyPath'] === null || typeof record['clientKeyPath'] === 'string'
      ? (record['clientKeyPath'] as string | null)
      : null;
  const legacyPassphrase = typeof record['passphrase'] === 'string' ? record['passphrase'] : '';

  if ((legacyCert || legacyKey) && entries.length === 0) {
    entries = [
      createHttpClientCertificateEntry({
        hostPattern: '*',
        clientCertPath: legacyCert,
        clientKeyPath: legacyKey,
        passphrase: legacyPassphrase,
      }),
    ];
  }

  return httpCertificatesSettingsSchema.parse({
    ignoreInvalidSsl,
    verifyHostname,
    caCertPath,
    entries,
  });
}

function normalizeDnsHostRow(item: unknown): HttpKeyValueRow {
  if (typeof item !== 'object' || item === null) {
    return createHttpKeyValueRow();
  }
  const row = item as Record<string, unknown>;
  const created = createHttpKeyValueRow({
    enabled: typeof row['enabled'] === 'boolean' ? row['enabled'] : true,
    key: typeof row['key'] === 'string' ? row['key'] : '',
    value: typeof row['value'] === 'string' ? row['value'] : '',
    ...(typeof row['description'] === 'string' ? { description: row['description'] } : {}),
  });
  const id = typeof row['id'] === 'string' && row['id'].trim() ? row['id'].trim() : created.id;
  return { ...created, id };
}

/** Normalizes DNS override rows (legacy saves may omit `enabled` or use empty ids). */
export function normalizeHttpDnsSettings(raw: unknown): HttpDnsSettings {
  const defaults = createDefaultHttpSettings().dns;
  if (typeof raw !== 'object' || raw === null) {
    return defaults;
  }
  const record = raw as Record<string, unknown>;
  const hosts = Array.isArray(record['hosts'])
    ? record['hosts'].map((item) => normalizeDnsHostRow(item))
    : defaults.hosts;

  return httpDnsSettingsSchema.parse({
    overrideEnabled:
      typeof record['overrideEnabled'] === 'boolean'
        ? record['overrideEnabled']
        : defaults.overrideEnabled,
    servers: typeof record['servers'] === 'string' ? record['servers'] : defaults.servers,
    hosts,
  });
}

/** Creates a new key/value row with a stable id. */
export function createHttpKeyValueRow(
  partial?: Partial<Pick<HttpKeyValueRow, 'enabled' | 'key' | 'value' | 'description'>>,
): HttpKeyValueRow {
  const id =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `kv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    enabled: partial?.enabled ?? true,
    key: partial?.key ?? '',
    value: partial?.value ?? '',
    ...(partial?.description !== undefined ? { description: partial.description } : {}),
  };
}

export function createDefaultHttpSettings(): HttpSettings {
  return {
    request: {
      defaultMethod: 'GET',
      activeSectionOnOpen: DEFAULT_HTTP_ACTIVE_SECTION_ON_OPEN,
      defaultResponseTabOnSend: DEFAULT_HTTP_RESPONSE_TAB_ON_SEND,
      defaultUrlScheme: 'https',
      autoFixUrlOnSend: true,
      prependWwwOnSend: true,
      autoDetectContentTypeOnSend: true,
      timeoutMs: 30_000,
      useCookies: true,
      http2Enabled: true,
      http2FallbackToHttp1: true,
      followRedirects: true,
      maxRedirects: 10,
      strictSsl: true,
      disableCookiesGlobally: false,
    },
    retries: {
      enabled: false,
      maxAttempts: 3,
      delayMs: 300,
      exponentialBackoff: true,
      backoffMultiplier: 2,
      maxDelayMs: 10_000,
    },
    testing: {
      e2eScreenshotFolder: '',
    },
    headers: {
      applyDefaultHeaders: true,
      rows: createDefaultHttpHeaderRows('0.0.0'),
    },
    certificates: {
      ignoreInvalidSsl: false,
      verifyHostname: true,
      caCertPath: null,
      entries: [],
    },
    dns: {
      overrideEnabled: false,
      servers: '',
      hosts: [],
    },
    proxy: {
      enabled: false,
      httpProxy: '',
      httpsProxy: '',
      bypass: 'localhost,127.0.0.1',
    },
  };
}

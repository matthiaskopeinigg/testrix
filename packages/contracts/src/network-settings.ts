import { z } from 'zod';

export const proxyModeSchema = z.enum(['system', 'none', 'http', 'socks5']);

export type ProxyMode = z.infer<typeof proxyModeSchema>;

export const PROXY_MODE_OPTIONS = proxyModeSchema.options;

export const dnsModeSchema = z.enum(['system', 'custom']);

export type DnsMode = z.infer<typeof dnsModeSchema>;

export const DNS_MODE_OPTIONS = dnsModeSchema.options;

export const certFileKindSchema = z.enum(['ca', 'cert', 'key']);

export type CertFileKind = z.infer<typeof certFileKindSchema>;

export const chooseFileKindSchema = z.enum(['ca', 'cert', 'key', 'sqlite', 'oracle-client']);

export type ChooseFileKind = z.infer<typeof chooseFileKindSchema>;

export const proxySettingsSchema = z.object({
  mode: proxyModeSchema,
  host: z.string(),
  port: z.string(),
  username: z.string(),
  password: z.string(),
  bypass: z.string(),
});

export type ProxySettings = z.infer<typeof proxySettingsSchema>;

export const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  mode: 'system',
  host: '',
  port: '',
  username: '',
  password: '',
  bypass: '',
};

export const dnsSettingsSchema = z.object({
  mode: dnsModeSchema,
  servers: z.string(),
});

export type DnsSettings = z.infer<typeof dnsSettingsSchema>;

export const DEFAULT_DNS_SETTINGS: DnsSettings = {
  mode: 'system',
  servers: '',
};

export const clientCertificateSchema = z.object({
  id: z.string().min(1),
  host: z.string(),
  certPath: z.string(),
  keyPath: z.string(),
  passphrase: z.string(),
});

export type ClientCertificate = z.infer<typeof clientCertificateSchema>;

export const certificateSettingsSchema = z.object({
  verifyTls: z.boolean(),
  extraCaPath: z.string(),
  clientCerts: z.array(clientCertificateSchema),
});

export type CertificateSettings = z.infer<typeof certificateSettingsSchema>;

export const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  verifyTls: true,
  extraCaPath: '',
  clientCerts: [],
};

/**
 * Builds an empty client certificate row for Settings.
 */
export function createClientCertificate(): ClientCertificate {
  return {
    id: crypto.randomUUID(),
    host: '',
    certPath: '',
    keyPath: '',
    passphrase: '',
  };
}

/**
 * Merges a raw proxy object onto defaults.
 */
export function parseProxySettings(raw: unknown): ProxySettings {
  const source = asRecord(raw);
  return proxySettingsSchema.parse({
    ...DEFAULT_PROXY_SETTINGS,
    mode: parseEnum(PROXY_MODE_OPTIONS, source['mode'], DEFAULT_PROXY_SETTINGS.mode),
    host: parseString(source['host']),
    port: parsePort(source['port']),
    username: parseString(source['username']),
    password: parseString(source['password']),
    bypass: parseString(source['bypass']),
  });
}

/**
 * Merges a raw DNS object onto defaults.
 */
export function parseDnsSettings(raw: unknown): DnsSettings {
  const source = asRecord(raw);
  return dnsSettingsSchema.parse({
    ...DEFAULT_DNS_SETTINGS,
    mode: parseEnum(DNS_MODE_OPTIONS, source['mode'], DEFAULT_DNS_SETTINGS.mode),
    servers: parseString(source['servers']),
  });
}

/**
 * Merges a raw certificates object onto defaults.
 */
export function parseCertificateSettings(raw: unknown): CertificateSettings {
  const source = asRecord(raw);
  return certificateSettingsSchema.parse({
    ...DEFAULT_CERTIFICATE_SETTINGS,
    verifyTls:
      typeof source['verifyTls'] === 'boolean'
        ? source['verifyTls']
        : DEFAULT_CERTIFICATE_SETTINGS.verifyTls,
    extraCaPath: parseString(source['extraCaPath']),
    clientCerts: parseClientCertificates(source['clientCerts']),
  });
}

function parseClientCertificates(raw: unknown): ClientCertificate[] {
  if (!Array.isArray(raw))
    return [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return [];
    const source = item as Record<string, unknown>;
    const id = parseString(source['id']);
    const parsed = clientCertificateSchema.safeParse({
      id: id || `cert_${index + 1}`,
      host: parseString(source['host']),
      certPath: parseString(source['certPath']),
      keyPath: parseString(source['keyPath']),
      passphrase: parseString(source['passphrase']),
    });
    return parsed.success ? [parsed.data] : [];
  });
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  return {};
}

function parseString(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function parsePort(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw))
    return String(Math.round(raw));
  return parseString(raw);
}

function parseEnum<T extends string>(options: readonly T[], raw: unknown, fallback: T): T {
  return typeof raw === 'string' && options.includes(raw as T) ? (raw as T) : fallback;
}

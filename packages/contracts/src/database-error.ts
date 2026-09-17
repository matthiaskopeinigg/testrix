import { DATABASE_TYPE_LABELS, type DatabaseConnection, type DatabaseType } from './database';

export interface DatabaseErrorContext {
  readonly type?: DatabaseType;
  readonly host?: string;
  readonly port?: number | string | null;
  readonly database?: string;
  readonly filePath?: string;
}

const IPC_INVOKE_PREFIX = /^Error invoking remote method '[^']+':\s*/i;

const USELESS_MESSAGES = new Set([
  '',
  'error',
  'aggregateerror',
  'systemerror',
  'typeerror',
  'uncaughterror',
]);

/**
 * Turns a driver, Node, or Electron IPC error into a short message the UI can show.
 */
export function formatDatabaseError(error: unknown, context?: DatabaseErrorContext): string {
  const bits = collectDatabaseErrorBits(error);
  const mapped = mapKnownDatabaseError(bits, context);
  if (mapped)
    return mapped;
  const useful = bits.messages.find((message) => isUsefulDatabaseMessage(message));
  if (useful)
    return useful;
  return `The ${engineLabel(context?.type)} request failed.`;
}

export function databaseErrorContext(
  connection: Pick<DatabaseConnection, 'type' | 'host' | 'port' | 'database' | 'filePath'>,
): DatabaseErrorContext {
  return {
    type: connection.type,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    filePath: connection.filePath,
  };
}

interface DatabaseErrorBits {
  readonly messages: string[];
  readonly codes: string[];
  readonly address?: string;
  readonly port?: number;
}

function collectDatabaseErrorBits(error: unknown): DatabaseErrorBits {
  const messages: string[] = [];
  const codes: string[] = [];
  let address: string | undefined;
  let port: number | undefined;
  const seen = new Set<unknown>();

  function visit(value: unknown): void {
    if (value == null || seen.has(value))
      return;
    if (typeof value === 'string') {
      const cleaned = cleanErrorText(value);
      if (cleaned)
        messages.push(cleaned);
      return;
    }
    if (typeof value !== 'object')
      return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record['message'] === 'string') {
      const cleaned = cleanErrorText(record['message']);
      if (cleaned)
        messages.push(cleaned);
    }
    if (typeof record['name'] === 'string') {
      const cleaned = cleanErrorText(record['name']);
      if (cleaned && cleaned.toLowerCase() !== 'error')
        messages.push(cleaned);
    }
    if (typeof record['detail'] === 'string') {
      const cleaned = cleanErrorText(record['detail']);
      if (cleaned)
        messages.push(cleaned);
    }
    for (const key of ['code', 'errno', 'sqlState', 'number', 'severity'] as const) {
      const raw = record[key];
      if (raw != null && raw !== '')
        codes.push(String(raw));
    }
    if (typeof record['address'] === 'string' && record['address'])
      address = record['address'];
    const parsedPort = Number(record['port']);
    if (Number.isFinite(parsedPort) && parsedPort > 0)
      port = parsedPort;
    visit(record['cause']);
    visit(record['originalError']);
    visit(record['error']);
    visit(record['reason']);
    if (Array.isArray(record['errors'])) {
      for (const inner of record['errors'])
        visit(inner);
    }
  }

  visit(error);
  return { messages, codes, address, port };
}

function mapKnownDatabaseError(bits: DatabaseErrorBits, context?: DatabaseErrorContext): string | null {
  const haystack = `${bits.codes.join(' ')} ${bits.messages.join(' ')}`.toLowerCase();
  const engine = engineLabel(context?.type);
  const where = formatWhere(bits, context);

  if (includesAny(haystack, 'econnrefused', 'enotconn', 'ehostunreach', 'eaddrnotavail', 'no listener', 'ora-12541'))
    return `Could not connect to ${engine} at ${where}. Is the server running?`;

  if (includesAny(haystack, 'enotfound', 'eai_again', 'getaddrinfo', 'ora-12154', 'could not resolve'))
    return `Could not resolve host "${hostOf(bits, context)}". Check the host name.`;

  if (includesAny(haystack, 'etimedout', 'etimeout', 'esockettimedout', 'timed out', 'timeout exceeded'))
    return `Timed out connecting to ${engine} at ${where}.`;

  if (includesAny(haystack, 'econnreset', 'econnaborted', 'epipe', 'connection reset'))
    return `The connection to ${engine} at ${where} was reset.`;

  if (
    includesAny(
      haystack,
      'self-signed',
      'unable to verify the first certificate',
      'cert_has_expired',
      'err_tls_cert',
      'certificate_verify_failed',
      'ssl routines',
      'tls handshake',
    )
  )
    return `TLS failed for ${engine} at ${where}. For a local server, try turning TLS off.`;

  if (
    includesAny(
      haystack,
      '28p01',
      '28000',
      'password authentication failed',
      'er_access_denied',
      'access denied',
      '1045',
      '18456',
      'login failed',
      'ora-01017',
      'noauth',
      'wrongpass',
      'authentication failed',
      'auth failed',
      'invalid username',
      'invalid password',
    )
  )
    return 'Authentication failed. Check the user and password.';

  if (
    includesAny(
      haystack,
      '3d000',
      '3f000',
      'er_bad_db_error',
      'unknown database',
      'cannot open database',
    ) || /database ["'`][^"'`]+["'`] does not exist/i.test(haystack)
  ) {
    const named = haystack.match(/database ["'`]([^"'`]+)["'`]/i)?.[1];
    const name = named || context?.database?.trim();
    return name
      ? `Database "${name}" does not exist.`
      : 'The selected database does not exist.';
  }

  if (includesAny(haystack, 'sqlite_cantopen', 'unable to open database', 'enoent') && context?.type === 'sqlite')
    return `Could not open the SQLite file${context.filePath ? ` "${context.filePath}"` : ''}.`;

  if (includesAny(haystack, 'sqlite_busy', 'database is locked'))
    return 'SQLite is busy. Another process may have the file locked.';

  if (includesAny(haystack, '53300', 'too many connections', 'er_con_count'))
    return `${engine} has too many connections. Try again in a moment.`;

  if (includesAny(haystack, '57p01', '57p02', '57p03', 'shutting down', 'not accepting connections'))
    return `${engine} at ${where} is not accepting connections.`;

  if (isUselessDatabaseFailure(bits) && (context?.host || context?.filePath || bits.address))
    return `Could not connect to ${engine} at ${where}. Is the server running?`;

  return null;
}

function isUselessDatabaseFailure(bits: DatabaseErrorBits): boolean {
  if (bits.codes.some((code) => /^(econnrefused|enotfound|etimedout|eai_again)$/i.test(code)))
    return true;
  return bits.messages.every((message) => !isUsefulDatabaseMessage(message));
}

function isUsefulDatabaseMessage(message: string): boolean {
  const trimmed = cleanErrorText(message);
  if (!trimmed)
    return false;
  return !USELESS_MESSAGES.has(trimmed.toLowerCase());
}

function cleanErrorText(raw: string): string {
  let text = raw.trim();
  text = text.replace(IPC_INVOKE_PREFIX, '').trim();
  text = text.replace(/^error:\s*/i, '').trim();
  return text;
}

function formatWhere(bits: DatabaseErrorBits, context?: DatabaseErrorContext): string {
  if (context?.type === 'sqlite')
    return context.filePath?.trim() || 'the SQLite file';
  const host = hostOf(bits, context);
  const port = portOf(bits, context);
  return port ? `${host}:${port}` : host;
}

function hostOf(bits: DatabaseErrorBits, context?: DatabaseErrorContext): string {
  const fromMessage = bits.messages.join(' ').match(
    /(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\s+(?:[\w.]+\s+)?([^\s:]+)/i,
  );
  return (bits.address || fromMessage?.[1] || context?.host || 'the host').trim() || 'the host';
}

function portOf(bits: DatabaseErrorBits, context?: DatabaseErrorContext): string {
  if (bits.port)
    return String(bits.port);
  const fromContext = Number(context?.port);
  if (Number.isFinite(fromContext) && fromContext > 0)
    return String(fromContext);
  const fromMessage = bits.messages.join(' ').match(/(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT)[^\d]*:(\d{2,5})\b/i)
    ?? bits.messages.join(' ').match(/:(\d{2,5})\b/);
  return fromMessage?.[1] ?? '';
}

function engineLabel(type?: DatabaseType): string {
  if (!type)
    return 'database';
  return DATABASE_TYPE_LABELS[type] ?? 'database';
}

function includesAny(haystack: string, ...needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

import { unwrapIpcInvokeError } from '../errors';

/**
 * User-facing message for database connection and query failures.
 */
export function formatDatabaseConnectionError(error: unknown): string {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const message = formatDatabaseConnectionError(nested);
      if (message) {
        return message;
      }
    }
  }

  const ipc = unwrapIpcInvokeError(error);
  const code = readErrorCode(error);
  const message = ipc?.userMessage ?? readErrorMessage(error);

  if (code === 'ECONNREFUSED') {
    const target = extractHostPortHint(message) ?? 'the server';
    return `Connection refused (${target}). Check that the database is running and the host/port are correct.`;
  }

  if (code === 'ENOTFOUND') {
    return `Host not found. Check the hostname in your connection settings.`;
  }

  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return `Connection timed out or was reset. Increase the connect timeout or verify network access.`;
  }

  if (code === 'EACCES' || code === 'EPERM') {
    return `Permission denied. Check file path permissions or database credentials.`;
  }

  if (code === 'ENOENT') {
    return `File or path not found. Verify the SQLite file path.`;
  }

  const lower = message.toLowerCase();
  if (lower.includes('password authentication failed')) {
    return 'Authentication failed. Check the username and password.';
  }
  if (/password verifier type 0x939|njs-116/i.test(message)) {
    return (
      'The password is fine — DataGrip works because JDBC supports this account’s old 10G password hash. ' +
      'Testrix’s built-in Oracle driver (Thin mode) does not. Install Oracle Instant Client, ' +
      'set Instant Client folder on the connection (the folder that contains oci.dll), and test again.'
    );
  }
  if (/ORA-12505/i.test(message)) {
    return (
      'ORA-12505: the listener cannot resolve that SID. In Connection settings, either turn off ' +
      '“Use SID” and enter the service name (DataGrip URL with /service), or keep Use SID on and ' +
      'enter the exact SID from DataGrip’s @host:port:SID URL — not the service name.'
    );
  }
  if (/ORA-12514/i.test(message)) {
    return (
      'ORA-12514: the listener does not know that service name. Check the Service name field ' +
      '(or turn on Use SID if DataGrip connects with @host:port:SID).'
    );
  }
  if (lower.includes('timeout expired') || lower.includes('timed out')) {
    return message.includes('connect')
      ? 'Connection timed out. Is the server running and reachable?'
      : message;
  }

  const relationMissing = /relation ["']([^"']+)["'] does not exist/i.exec(message);
  if (relationMissing?.[1]) {
    return `Table or view "${relationMissing[1]}" does not exist. Check the name and schema.`;
  }
  const tableMissing =
    /table ['`]([^'`]+)['`] doesn'?t exist/i.exec(message) ??
    /table ["']([^"']+)["'] does not exist/i.exec(message) ??
    /no such table:\s*(\S+)/i.exec(message);
  if (tableMissing?.[1]) {
    return `Table "${tableMissing[1]}" does not exist. Check the name and schema.`;
  }
  if (
    /database ["'][^"']+["'] does not exist/i.test(message) ||
    /unknown database ['`][^'`]+['`]/i.test(message)
  ) {
    return 'Database does not exist. Check the database name or create it first.';
  }
  if (lower.includes('self signed certificate') || lower.includes('certificate')) {
    return 'TLS certificate error. Try disabling TLS or trust the server certificate.';
  }

  if (message) {
    return message;
  }

  return 'Connection failed.';
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (typeof error === 'string') {
    return error.trim();
  }
  return '';
}

function extractHostPortHint(message: string): string | undefined {
  const ipv4 = /(\d{1,3}(?:\.\d{1,3}){3}:\d+)/.exec(message);
  if (ipv4?.[1]) {
    return ipv4[1];
  }
  const hostPort = /(::1|127\.0\.0\.1|localhost):\d+/.exec(message);
  if (hostPort?.[0]) {
    return hostPort[0];
  }
  return undefined;
}

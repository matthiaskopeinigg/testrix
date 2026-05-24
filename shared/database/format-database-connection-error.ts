/**
 * User-facing message for database connection failures (IPC / Settings test).
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

  const code = readErrorCode(error);
  const message = readErrorMessage(error);

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
  if (lower.includes('timeout expired') || lower.includes('timed out')) {
    return message.includes('connect')
      ? 'Connection timed out. Is the server running and reachable?'
      : message;
  }
  if (lower.includes('does not exist') && lower.includes('database')) {
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

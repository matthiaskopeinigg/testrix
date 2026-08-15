/**
 * Builds a MongoDB connection URI from a Testrix profile.
 * When `host` is already `mongodb://` or `mongodb+srv://`, it is used as-is.
 */
export function resolveMongoConnectionUri(connection: {
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
  readonly tls?: boolean;
  readonly connectTimeoutMs?: number;
}): string {
  const host = connection.host?.trim() || 'localhost';
  if (host.startsWith('mongodb://') || host.startsWith('mongodb+srv://')) {
    return host;
  }
  const port = Number(connection.port) || 27017;
  const database = connection.database?.trim()
    ? `/${encodeURIComponent(connection.database.trim())}`
    : '/';
  const auth = connection.user
    ? `${encodeURIComponent(connection.user)}:${encodeURIComponent(connection.password ?? '')}@`
    : '';
  const params = new URLSearchParams();
  if (connection.tls) {
    params.set('tls', 'true');
  }
  if (!host.includes(',')) {
    params.set('directConnection', 'true');
  }
  const timeout = Number(connection.connectTimeoutMs);
  if (Number.isFinite(timeout) && timeout > 0) {
    params.set('serverSelectionTimeoutMS', String(Math.floor(timeout)));
  }
  const query = params.toString();
  return `mongodb://${auth}${host}:${port}${database}${query ? `?${query}` : ''}`;
}

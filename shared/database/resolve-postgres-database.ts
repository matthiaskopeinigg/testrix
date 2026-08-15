/**
 * PostgreSQL database name for a connection profile.
 *
 * An empty value is omitted so `pg` uses the username (libpq default) instead of
 * silently querying the empty `postgres` maintenance database.
 *
 * @param database - Optional database name from the connection profile.
 */
export function resolvePostgresDatabaseName(database: string | undefined): string | undefined {
  const name = database?.trim();
  return name ? name : undefined;
}

/**
 * Fingerprint of Postgres connect settings used to reuse or replace a pool.
 *
 * @param conn - Connection profile fields that affect the TCP session.
 */
export function postgresPoolFingerprint(conn: {
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
  readonly tls?: boolean;
}): string {
  return [
    conn.host || 'localhost',
    String(Number(conn.port) || 5432),
    conn.user ?? '',
    conn.password ?? '',
    resolvePostgresDatabaseName(conn.database) ?? '',
    conn.tls ? '1' : '0',
  ].join('\u001f');
}

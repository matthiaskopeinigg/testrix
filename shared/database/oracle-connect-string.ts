/**
 * Builds an Oracle Easy Connect string from a Testrix connection profile.
 *
 * `database` may be a service name / SID (`XEPDB1`) or a full Easy Connect /
 * TNS descriptor. Thin mode does not need Instant Client.
 */
export function resolveOracleConnectString(connection: {
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
}): string {
  const database = connection.database?.trim() ?? '';
  const host = connection.host?.trim() || 'localhost';
  const port = Number(connection.port) || 1521;
  if (!database) {
    return `${host}:${port}/XE`;
  }
  if (database.startsWith('(') || /:\d+\//.test(database) || /DESCRIPTION\s*=/i.test(database)) {
    return database.replace(/^\/\//, '');
  }
  return `${host}:${port}/${database}`;
}

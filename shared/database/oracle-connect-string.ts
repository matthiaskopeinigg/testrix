/**
 * Builds an Oracle Easy Connect or TNS connect string from a Testrix profile.
 *
 * `database` may be a service name, SID, or a full Easy Connect / TNS descriptor.
 * DataGrip JDBC URLs use `@host:port:SID` or `@host:port/service` — Testrix matches
 * that with `useSid`.
 */
export function resolveOracleConnectString(connection: {
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly useSid?: boolean;
}): string {
  const database = connection.database?.trim() ?? '';
  const host = connection.host?.trim() || 'localhost';
  const port = Number(connection.port) || 1521;
  if (!database) {
    return connection.useSid
      ? tnsSidConnectString(host, port, 'XE')
      : `${host}:${port}/XE`;
  }
  if (database.startsWith('(') || /:\d+\//.test(database) || /DESCRIPTION\s*=/i.test(database)) {
    return database.replace(/^\/\//, '');
  }
  if (connection.useSid || /^[^/\s]+:\d+:[^/\s]+$/.test(database)) {
    if (/^[^/\s]+:\d+:[^/\s]+$/.test(database)) {
      return tnsFromHostPortSid(database);
    }
    return tnsSidConnectString(host, port, database);
  }
  return `${host}:${port}/${database}`;
}

function tnsFromHostPortSid(value: string): string {
  const match = /^([^/\s]+):(\d+):([^/\s]+)$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    return value;
  }
  return tnsSidConnectString(match[1], Number(match[2]), match[3]);
}

function tnsSidConnectString(host: string, port: number, sid: string): string {
  return (
    `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${tnsToken(host)})(PORT=${port}))` +
    `(CONNECT_DATA=(SID=${tnsToken(sid)})))`
  );
}

function tnsToken(value: string): string {
  return value.replace(/[()=]/g, '');
}

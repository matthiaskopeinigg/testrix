/**
 * Builds an Oracle connect string from a Testrix profile.
 *
 * DataGrip JDBC “Service name” mode uses a TNS descriptor with `SERVICE_NAME`.
 * Easy Connect (`host:port/service`) is not always equivalent on corporate listeners
 * and can surface confusing ORA-12505/12514 errors. Testrix mirrors DataGrip:
 * service mode → `SERVICE_NAME`, SID mode → `SID`.
 *
 * Also accepts pasted JDBC thin URLs / Easy Connect fragments in host or database.
 */
export function resolveOracleConnectString(connection: {
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly useSid?: boolean;
}): string {
  const hostField = connection.host?.trim() ?? '';
  const databaseField = connection.database?.trim() ?? '';
  const defaultPort = Number(connection.port) || 1521;

  const pasted = parseOracleConnectPaste(hostField, databaseField);
  if (pasted?.kind === 'raw') {
    return pasted.connectString;
  }
  if (pasted) {
    // Pasted SID URL fragment always means SID; pasted service URL always means service.
    // Bare fields fall through and honor the Use SID toggle.
    const useSid = pasted.kind === 'sid';
    return useSid
      ? tnsSidConnectString(pasted.host, pasted.port, pasted.name)
      : tnsServiceConnectString(pasted.host, pasted.port, pasted.name);
  }

  const host = hostField || 'localhost';
  const port = defaultPort;
  const name = databaseField || 'XE';

  if (connection.useSid === true) {
    return tnsSidConnectString(host, port, name);
  }
  return tnsServiceConnectString(host, port, name);
}

type ParsedOracleConnect =
  | { readonly kind: 'raw'; readonly connectString: string }
  | {
      readonly kind: 'service' | 'sid';
      readonly host: string;
      readonly port: number;
      readonly name: string;
    };

/**
 * Extracts host/port/service (or SID) from common DataGrip / JDBC paste shapes.
 * Returns null when host + database are plain fields (not a URL fragment).
 */
function parseOracleConnectPaste(hostField: string, databaseField: string): ParsedOracleConnect | null {
  const candidates = [databaseField, hostField].filter(Boolean);
  for (const raw of candidates) {
    const value = stripJdbcThinPrefix(raw);
    if (!value) {
      continue;
    }

    if (value.startsWith('(') || /DESCRIPTION\s*=/i.test(value)) {
      return { kind: 'raw', connectString: value };
    }

    // Skip bare service/SID names — those use host/port fields + Use SID.
    if (!value.includes(':') && !value.includes('/')) {
      continue;
    }

    // Easy Connect service: //host:port/service or host:port/service
    const service =
      /^\/\/?([^/\s:]+):(\d+)\/([^/\s]+)$/.exec(value) ??
      /^([^/\s:]+):(\d+)\/([^/\s]+)$/.exec(value);
    if (service?.[1] && service[2] && service[3]) {
      return {
        kind: 'service',
        host: service[1],
        port: Number(service[2]),
        name: service[3],
      };
    }

    // Classic SID: host:port:sid (DataGrip SID URL fragment)
    const sid = /^([^/\s:]+):(\d+):([^/\s]+)$/.exec(value);
    if (sid?.[1] && sid[2] && sid[3]) {
      return {
        kind: 'sid',
        host: sid[1],
        port: Number(sid[2]),
        name: sid[3],
      };
    }
  }

  return null;
}

function stripJdbcThinPrefix(value: string): string {
  let next = value.trim();
  next = next.replace(/^jdbc:oracle:thin:@/i, '');
  next = next.replace(/^@/, '');
  return next.trim();
}

function tnsServiceConnectString(host: string, port: number, serviceName: string): string {
  return (
    `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${tnsToken(host)})(PORT=${port}))` +
    `(CONNECT_DATA=(SERVICE_NAME=${tnsToken(serviceName)})))`
  );
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

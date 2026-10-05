import { describe, expect, it } from 'vitest';

import {
  createDefaultDatabaseConnection,
  usesOracleThin,
  formatDatabaseConnectionString,
  parseDatabaseConnectionString,
  parseDatabasePrefs,
  parseDatabasesFile,
  parseQueriesFile,
  databaseConnectionTabNodeId,
  parseDatabaseTableTabNodeId,
  databaseTableTabNodeId,
  databaseDiagramTabNodeId,
  parseDatabaseDiagramTabNodeId,
} from './database';
import { formatDatabaseError } from './database-error';
import {
  countDatabaseExecuteStatements,
  isDestructiveSql,
  isSqlTransactionEngine,
  resolveDatabaseExecuteQuery,
  shouldHoldSqlSession,
  shouldPromptDatabaseExecuteChooser,
  sqlTransactionControl,
} from './database-sql';

describe('parseDatabasesFile', () => {
  it('returns empty nodes for invalid input', () => {
    expect(parseDatabasesFile(null).nodes).toEqual([]);
  });

  it('parses a connection tree', () => {
    const file = parseDatabasesFile({
      nodes: [createDefaultDatabaseConnection('sqlite')],
    });
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]?.kind).toBe('connection');
  });

  it('drops ClickHouse and CockroachDB connections from saved files', () => {
    const file = parseDatabasesFile({
      nodes: [
        { ...createDefaultDatabaseConnection('postgresql'), id: 'pg' },
        { id: 'ch', kind: 'connection', name: 'CH', type: 'clickhouse', host: 'localhost', port: 8123, connectOnBoot: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'cr', kind: 'connection', name: 'CR', type: 'cockroachdb', host: 'localhost', port: 26257, connectOnBoot: false, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]?.id).toBe('pg');
  });
});

describe('Oracle thin mode', () => {
  it('starts new Oracle connections on the thin driver', () => {
    expect(createDefaultDatabaseConnection('oracle').oracleThin).toBe(true);
    expect(usesOracleThin(createDefaultDatabaseConnection('oracle'))).toBe(true);
  });

  it('keeps a saved client path on the thick driver until thin is chosen', () => {
    expect(usesOracleThin({ clientPath: 'C:/instantclient' })).toBe(false);
    expect(usesOracleThin({ oracleThin: true, clientPath: 'C:/instantclient' })).toBe(true);
    expect(usesOracleThin({ oracleThin: false })).toBe(false);
  });
});

describe('parseQueriesFile', () => {
  it('migrates a v1 queries array', () => {
    const file = parseQueriesFile({
      queries: [{ id: 'q1', name: 'List', connectionId: '', query: 'SELECT 1', updatedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]?.kind).toBe('query');
  });

  it('keeps a saved last result', () => {
    const file = parseQueriesFile({
      nodes: [
        {
          id: 'q1',
          kind: 'query',
          name: 'List',
          connectionId: '',
          query: 'SELECT 1',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastResult: {
            table: { columns: ['id'], rows: [[1]], hasMore: false },
            durationMs: 4,
            hidden: true,
            consoleHeight: 168,
          },
        },
      ],
    });
    const query = file.nodes[0];
    expect(query && query.kind === 'query' ? query.lastResult?.table.rows : null).toEqual([[1]]);
    expect(query && query.kind === 'query' ? query.lastResult?.hidden : null).toBe(true);
  });
});

describe('parseDatabasePrefs', () => {
  it('clamps idle minutes and rollback seconds', () => {
    const prefs = parseDatabasePrefs({
      connectOnStartup: true,
      idleDisconnectMinutes: 999,
      uncommittedRollbackSeconds: -4,
    });
    expect(prefs.connectOnStartup).toBe(true);
    expect(prefs.idleDisconnectMinutes).toBe(120);
    expect(prefs.uncommittedRollbackSeconds).toBe(0);
  });
});

describe('tab node ids', () => {
  it('round-trips a table target', () => {
    const id = databaseTableTabNodeId({ connectionId: 'c1', schema: 'public', table: 'users' });
    expect(parseDatabaseTableTabNodeId(id)).toEqual({
      connectionId: 'c1',
      schema: 'public',
      table: 'users',
    });
    expect(databaseConnectionTabNodeId('c1')).toBe('dbc:c1');
  });

  it('round-trips a diagram target', () => {
    const id = databaseDiagramTabNodeId({ connectionId: 'c1', schema: 'public' });
    expect(parseDatabaseDiagramTabNodeId(id)).toEqual({
      connectionId: 'c1',
      schema: 'public',
    });
  });
});

describe('parseDatabaseConnectionString', () => {
  it('fills host user password database and port from a postgres URI', () => {
    expect(parseDatabaseConnectionString('postgres://alice:s3cret@db.example:5433/app?sslmode=require')).toEqual({
      type: 'postgresql',
      host: 'db.example',
      port: 5433,
      user: 'alice',
      password: 's3cret',
      database: 'app',
      tls: true,
    });
  });

  it('maps rediss to redis with tls', () => {
    expect(parseDatabaseConnectionString('rediss://:pass@127.0.0.1:6380/0')).toMatchObject({
      type: 'redis',
      host: '127.0.0.1',
      port: 6380,
      password: 'pass',
      database: '0',
      tls: true,
    });
  });

  it('parses a sqlite file URI', () => {
    expect(parseDatabaseConnectionString('sqlite:///C:/data/app.db')).toMatchObject({
      type: 'sqlite',
      filePath: 'C:/data/app.db',
    });
  });

  it('parses semicolon key=value strings', () => {
    expect(
      parseDatabaseConnectionString('Host=10.0.0.8;Port=3306;Username=root;Password=x;Database=shop'),
    ).toMatchObject({
      host: '10.0.0.8',
      port: 3306,
      user: 'root',
      password: 'x',
      database: 'shop',
    });
  });

  it('round-trips format then parse for postgresql', () => {
    const formatted = formatDatabaseConnectionString({
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      user: 'me',
      password: 'pw',
      database: 'testrix',
      tls: false,
    });
    expect(parseDatabaseConnectionString(formatted)).toMatchObject({
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      user: 'me',
      password: 'pw',
      database: 'testrix',
    });
  });
});

describe('resolveDatabaseExecuteQuery', () => {
  it('runs a non-empty selection as-is', () => {
    const source = 'SELECT 1;\nSELECT 2;';
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: 0,
        selectionEnd: 9,
        language: 'sql',
      }),
    ).toBe('SELECT 1');
  });

  it('runs the statement at the caret', () => {
    const source = 'SELECT 1;\nSELECT 2;';
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: source.length,
        selectionEnd: source.length,
        language: 'sql',
      }),
    ).toBe('SELECT 2');
  });

  it('prompts when several SQL statements exist and nothing is selected', () => {
    expect(
      shouldPromptDatabaseExecuteChooser({
        source: 'SELECT 1;\nSELECT 2;',
        selectionStart: 0,
        selectionEnd: 0,
        language: 'sql',
      }),
    ).toBe(true);
    expect(countDatabaseExecuteStatements({ source: 'SELECT 1;\nSELECT 2;', language: 'sql' })).toBe(2);
  });

  it('does not prompt for a selection', () => {
    expect(
      shouldPromptDatabaseExecuteChooser({
        source: 'SELECT 1;\nSELECT 2;',
        selectionStart: 0,
        selectionEnd: 9,
        language: 'sql',
      }),
    ).toBe(false);
  });
});

describe('formatDatabaseError', () => {
  it('unwraps AggregateError connection refused into a host message', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
      address: '127.0.0.1',
      port: 5432,
    });
    const error = new AggregateError([inner], '');
    expect(formatDatabaseError(error, { type: 'postgresql', host: 'localhost', port: 5432 })).toBe(
      'Could not connect to PostgreSQL at 127.0.0.1:5432. Is the server running?',
    );
  });

  it('strips the Electron IPC prefix when nested errors are missing', () => {
    const error = new Error("Error invoking remote method 'testrix:database:test': AggregateError");
    expect(formatDatabaseError(error, { type: 'postgresql', host: 'localhost', port: 5432 })).toBe(
      'Could not connect to PostgreSQL at localhost:5432. Is the server running?',
    );
  });

  it('maps authentication failures', () => {
    expect(formatDatabaseError(new Error('password authentication failed for user "postgres"'))).toBe(
      'Authentication failed. Check the user and password.',
    );
  });

  it('keeps a useful SQL message', () => {
    expect(formatDatabaseError(new Error('column "foo" does not exist'))).toBe(
      'column "foo" does not exist',
    );
  });
});

describe('isDestructiveSql', () => {
  it('treats insert as a write and select as a read', () => {
    expect(isDestructiveSql('INSERT INTO t VALUES (1)')).toBe(true);
    expect(isDestructiveSql('SELECT * FROM t')).toBe(false);
    expect(isDestructiveSql('-- note\nUPDATE t SET a = 1')).toBe(true);
  });
});

describe('sql transactions', () => {
  it('holds a session for every statement on SQL engines', () => {
    expect(isSqlTransactionEngine('postgresql')).toBe(true);
    expect(isSqlTransactionEngine('sqlite')).toBe(true);
    expect(isSqlTransactionEngine('oracle')).toBe(true);
    expect(isSqlTransactionEngine('redis')).toBe(false);
    expect(shouldHoldSqlSession('SELECT 1', 'postgresql')).toBe(true);
    expect(shouldHoldSqlSession('INSERT INTO t VALUES (1)', 'mysql')).toBe(true);
    expect(shouldHoldSqlSession('SELECT 1', 'redis')).toBe(false);
    expect(shouldHoldSqlSession('COMMIT', 'postgresql')).toBe(false);
  });

  it('classifies begin commit and rollback', () => {
    expect(sqlTransactionControl('BEGIN')).toBe('begin');
    expect(sqlTransactionControl('START TRANSACTION')).toBe('begin');
    expect(sqlTransactionControl('COMMIT')).toBe('commit');
    expect(sqlTransactionControl('ROLLBACK')).toBe('rollback');
    expect(sqlTransactionControl('ROLLBACK TO sp')).toBe(null);
    expect(sqlTransactionControl('BEGIN DBMS_OUTPUT.PUT_LINE(1); END')).toBe(null);
    expect(sqlTransactionControl('SELECT 1')).toBe(null);
  });
});

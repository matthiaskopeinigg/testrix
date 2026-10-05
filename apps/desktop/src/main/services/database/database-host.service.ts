import type {
  DatabaseConnection,
  DatabaseConnectionStatusMap,
  DatabaseIntrospectLevel,
  DatabaseIntrospectResult,
  DatabaseQueryEnvelope,
  DatabaseQueryRequest,
  DatabaseSessionQueryRequest,
  DatabaseSessionState,
  DatabaseType,
} from '@testrix/contracts';
import {
  databaseEngineFamily,
  databaseErrorContext,
  formatDatabaseError,
  sqlTransactionControl,
  usesOracleThin,
  tableDmlBeginSql,
  tableDmlCommitSql,
  tableDmlRollbackSql,
} from '@testrix/contracts';
import { appLogger } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
import { introspectConnection } from './database-introspect';
import {
  applySqlPage,
  busyTimeoutMs,
  commandTimeoutMs,
  connectTimeoutMs,
  loadDriver,
  logDatabase,
  resolveSqlitePath,
  rowsFromRecords,
  toQueryCell,
  withTimeout,
} from './database-util';

interface PinnedSession {
  readonly tabId: string;
  readonly connection: DatabaseConnection;
  readonly connectionId: string;
  readonly type: DatabaseType;
  uncommitted: boolean;
  nativeTxn: boolean;
  rollbackAt: number | null;
  rollbackTimer: ReturnType<typeof setTimeout> | null;
  client: unknown;
  release: () => Promise<void>;
}

/**
 * Pools driver connections, runs queries, and holds uncommitted SQL sessions per workbench tab.
 */
export class DatabaseHost {
  private readonly lastActivityAt = new Map<string, number>();
  private readonly inFlight = new Map<string, number>();
  private readonly sqliteDbs = new Map<string, { db: SqliteDatabase; connectionIds: Set<string> }>();
  private readonly pgPools = new Map<string, { fingerprint: string; pool: PgPool }>();
  private readonly mysqlPools = new Map<string, MysqlPool>();
  private readonly mssqlPools = new Map<string, MssqlPool>();
  private readonly redisClients = new Map<string, RedisClient>();
  private readonly mongoClients = new Map<string, { fingerprint: string; client: MongoClient }>();
  private readonly sessions = new Map<string, PinnedSession>();
  private readonly statuses: Record<string, { state: 'unknown' | 'checking' | 'connected' | 'error'; message?: string }> = {};
  private idleWatchTimer: ReturnType<typeof setInterval> | null = null;
  private getIdleMinutes: () => number = () => 0;
  private getRollbackSeconds: () => number = () => 60;

  configure(options: {
    readonly idleMinutes: () => number;
    readonly rollbackSeconds: () => number;
  }): void {
    this.getIdleMinutes = options.idleMinutes;
    this.getRollbackSeconds = options.rollbackSeconds;
    if (this.idleWatchTimer !== null)
      return;
    this.idleWatchTimer = setInterval(() => {
      detach('database:idle', this.closeIdleConnections());
    }, 15_000);
    this.idleWatchTimer.unref?.();
  }

  statusesSnapshot(): DatabaseConnectionStatusMap {
    return { ...this.statuses };
  }

  async test(connection: DatabaseConnection): Promise<{ ok: true }> {
    this.statuses[connection.id] = { state: 'checking' };
    try {
      await this.query({ connection, query: probeSql(connection) });
      this.statuses[connection.id] = { state: 'connected' };
      return { ok: true };
    } catch (error) {
      throw this.recordFailure(connection, error);
    }
  }

  async warmBoot(connections: readonly DatabaseConnection[]): Promise<void> {
    for (const connection of connections) {
      if (!connection.connectOnBoot)
        continue;
      try {
        await this.test(connection);
      } catch {
        /* status already recorded */
      }
    }
  }

  async query(payload: DatabaseQueryRequest): Promise<DatabaseQueryEnvelope> {
    this.beginActivity(payload.connection.id);
    const started = Date.now();
    try {
      const table = await this.execute(payload.connection, payload.query, payload.page, payload.timeoutMs, false);
      this.statuses[payload.connection.id] = { state: 'connected' };
      return { table, durationMs: Date.now() - started };
    } catch (error) {
      throw this.recordFailure(payload.connection, error);
    } finally {
      this.endActivity(payload.connection.id);
    }
  }

  async introspect(payload: {
    readonly connection: DatabaseConnection;
    readonly level: DatabaseIntrospectLevel;
    readonly schema?: string;
    readonly table?: string;
  }): Promise<DatabaseIntrospectResult> {
    this.beginActivity(payload.connection.id);
    try {
      const run = async (sql: string) => {
        const envelope = await this.query({ connection: payload.connection, query: sql });
        return envelope.table;
      };
      const result = await introspectConnection(payload.connection, payload.level, payload.schema, payload.table, run);
      this.statuses[payload.connection.id] = { state: 'connected' };
      return result;
    } catch (error) {
      throw this.recordFailure(payload.connection, error);
    } finally {
      this.endActivity(payload.connection.id);
    }
  }

  async sessionQuery(payload: DatabaseSessionQueryRequest, holdTransaction: boolean): Promise<DatabaseQueryEnvelope> {
    this.beginActivity(payload.connection.id);
    const started = Date.now();
    try {
      const existing = this.sessions.get(payload.tabId);
      const shouldHold = holdTransaction || Boolean(existing?.uncommitted);
      if (!shouldHold) {
        const table = await this.execute(payload.connection, payload.query, payload.page, payload.timeoutMs, false);
        return { table, durationMs: Date.now() - started };
      }
      const session = await this.ensureSession(payload.tabId, payload.connection);
      const control = sqlTransactionControl(payload.query);
      if (!session.uncommitted) {
        const beginSql = tableDmlBeginSql(payload.connection.type);
        if (control === 'begin' && !session.nativeTxn)
          await this.executeOnSession(session, payload.connection, payload.query);
        else if (beginSql && !session.nativeTxn)
          await this.executeOnSession(session, payload.connection, beginSql);
        session.uncommitted = true;
        this.armRollback(session);
      }
      if (control === 'begin') {
        this.statuses[payload.connection.id] = { state: 'connected' };
        return { table: { columns: [], rows: [], hasMore: false }, durationMs: Date.now() - started };
      }
      const table = await this.executeOnSession(session, payload.connection, payload.query, payload.page);
      this.statuses[payload.connection.id] = { state: 'connected' };
      return { table, durationMs: Date.now() - started };
    } catch (error) {
      throw this.recordFailure(payload.connection, error);
    } finally {
      this.endActivity(payload.connection.id);
    }
  }

  async sessionCommit(tabId: string, connection: DatabaseConnection): Promise<DatabaseSessionState> {
    const session = this.sessions.get(tabId);
    if (!session)
      return { tabId, open: false, uncommitted: false, rollbackAt: null };
    if (session.nativeTxn)
      await this.commitNative(session);
    else {
      const commitSql = tableDmlCommitSql(connection.type);
      if (commitSql)
        await this.executeOnSession(session, connection, commitSql);
    }
    await this.releaseSession(tabId);
    return { tabId, open: false, uncommitted: false, rollbackAt: null };
  }

  async sessionRollback(tabId: string, connection: DatabaseConnection): Promise<DatabaseSessionState> {
    const session = this.sessions.get(tabId);
    if (!session)
      return { tabId, open: false, uncommitted: false, rollbackAt: null };
    try {
      if (session.nativeTxn)
        await this.rollbackNative(session);
      else {
        const rollbackSql = tableDmlRollbackSql(connection.type);
        if (rollbackSql)
          await this.executeOnSession(session, connection, rollbackSql);
      }
    } catch {
      /* ignore */
    }
    await this.releaseSession(tabId);
    return { tabId, open: false, uncommitted: false, rollbackAt: null };
  }

  sessionConnectionId(tabId: string): string | null {
    return this.sessions.get(tabId)?.connectionId ?? null;
  }

  sessionState(tabId: string): DatabaseSessionState {
    const session = this.sessions.get(tabId);
    if (!session)
      return { tabId, open: false, uncommitted: false, rollbackAt: null };
    return {
      tabId,
      open: true,
      uncommitted: session.uncommitted,
      rollbackAt: session.rollbackAt,
    };
  }

  pinnedIds(): ReadonlySet<string> {
    return new Set([...this.sessions.values()].map((item) => item.connectionId));
  }

  async disconnect(connectionId: string): Promise<void> {
    for (const [tabId, session] of [...this.sessions.entries()]) {
      if (session.connectionId === connectionId)
        await this.releaseSession(tabId);
    }
    await this.closeConnection(connectionId);
    this.statuses[connectionId] = { state: 'unknown' };
  }

  async closeAll(): Promise<void> {
    if (this.idleWatchTimer) {
      clearInterval(this.idleWatchTimer);
      this.idleWatchTimer = null;
    }
    for (const [tabId, session] of [...this.sessions.entries()])
      await this.sessionRollback(tabId, session.connection);
    await Promise.allSettled([...this.collectClosePromises()]);
    this.sqliteDbs.clear();
    this.pgPools.clear();
    this.mysqlPools.clear();
    this.mssqlPools.clear();
    this.redisClients.clear();
    this.mongoClients.clear();
    this.lastActivityAt.clear();
    this.inFlight.clear();
  }

  private async closeIdleConnections(): Promise<void> {
    const idleMinutes = this.getIdleMinutes();
    if (idleMinutes <= 0)
      return;
    const cutoff = Date.now() - idleMinutes * 60_000;
    const pinned = this.pinnedIds();
    for (const id of [...this.lastActivityAt.keys()]) {
      if (pinned.has(id) || (this.inFlight.get(id) ?? 0) > 0)
        continue;
      const last = this.lastActivityAt.get(id) ?? 0;
      if (last > 0 && last <= cutoff) {
        logDatabase(`Disconnecting idle connection ${id}`);
        await this.closeConnection(id);
      }
    }
  }

  private async ensureSession(tabId: string, connection: DatabaseConnection): Promise<PinnedSession> {
    const existing = this.sessions.get(tabId);
    if (existing && existing.connectionId === connection.id)
      return existing;
    if (existing)
      await this.releaseSession(tabId);
    const family = databaseEngineFamily(connection.type);
    if (family === 'postgresql') {
      const pool = this.getPgPool(connection);
      const client = await pool.connect();
      const session: PinnedSession = {
        tabId,
        connection,
        connectionId: connection.id,
        type: connection.type,
        uncommitted: false,
        nativeTxn: false,
        rollbackAt: null,
        rollbackTimer: null,
        client,
        release: async () => {
          client.release();
        },
      };
      this.sessions.set(tabId, session);
      return session;
    }
    if (family === 'mysql') {
      const pool = this.getMysqlPool(connection);
      const client = await pool.getConnection();
      const session: PinnedSession = {
        tabId,
        connection,
        connectionId: connection.id,
        type: connection.type,
        uncommitted: false,
        nativeTxn: false,
        rollbackAt: null,
        rollbackTimer: null,
        client,
        release: async () => {
          client.release();
        },
      };
      this.sessions.set(tabId, session);
      return session;
    }
    if (family === 'mssql') {
      const sql = loadDriver<MssqlModule>('mssql');
      const pool = await this.getMssqlPool(connection);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      const session: PinnedSession = {
        tabId,
        connection,
        connectionId: connection.id,
        type: connection.type,
        uncommitted: true,
        nativeTxn: true,
        rollbackAt: null,
        rollbackTimer: null,
        client: transaction,
        release: async () => undefined,
      };
      this.armRollback(session);
      this.sessions.set(tabId, session);
      return session;
    }
    if (family === 'sqlite') {
      const db = this.getSqlite(connection);
      const session: PinnedSession = {
        tabId,
        connection,
        connectionId: connection.id,
        type: connection.type,
        uncommitted: false,
        nativeTxn: false,
        rollbackAt: null,
        rollbackTimer: null,
        client: db,
        release: async () => undefined,
      };
      this.sessions.set(tabId, session);
      return session;
    }
    if (family === 'oracle') {
      const oracledb = loadDriver<OracleModule>('oracledb');
      initOracleClient(oracledb, connection);
      const connectString = connection.useSid
        ? `${connection.host || 'localhost'}:${connection.port || 1521}:${connection.database || 'ORCL'}`
        : `${connection.host || 'localhost'}:${connection.port || 1521}/${connection.database || 'ORCL'}`;
      const client = await oracledb.getConnection({
        user: connection.user,
        password: connection.password,
        connectString,
      });
      const session: PinnedSession = {
        tabId,
        connection,
        connectionId: connection.id,
        type: connection.type,
        uncommitted: false,
        nativeTxn: false,
        rollbackAt: null,
        rollbackTimer: null,
        client,
        release: async () => {
          await client.close();
        },
      };
      this.sessions.set(tabId, session);
      return session;
    }
    const session: PinnedSession = {
      tabId,
      connection,
      connectionId: connection.id,
      type: connection.type,
      uncommitted: false,
      nativeTxn: false,
      rollbackAt: null,
      rollbackTimer: null,
      client: null,
      release: async () => undefined,
    };
    this.sessions.set(tabId, session);
    return session;
  }

  private armRollback(session: PinnedSession): void {
    if (session.rollbackTimer)
      clearTimeout(session.rollbackTimer);
    const seconds = this.getRollbackSeconds();
    if (seconds <= 0) {
      session.rollbackAt = null;
      session.rollbackTimer = null;
      return;
    }
    session.rollbackAt = Date.now() + seconds * 1000;
    session.rollbackTimer = setTimeout(() => {
      detach('database:auto-rollback', this.releaseSession(session.tabId, true));
    }, seconds * 1000);
  }

  private async releaseSession(tabId: string, timedOut = false): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session)
      return;
    if (session.rollbackTimer)
      clearTimeout(session.rollbackTimer);
    const rollbackSql = tableDmlRollbackSql(session.type);
    if (timedOut && session.uncommitted) {
      try {
        if (session.nativeTxn)
          await this.rollbackNative(session);
        else if (rollbackSql)
          await this.executeOnSession(session, session.connection, rollbackSql);
      } catch (error) {
        appLogger.warn('database', `Auto-rollback failed for ${session.connectionId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.sessions.delete(tabId);
    await session.release();
  }

  private async executeOnSession(
    session: PinnedSession,
    connection: DatabaseConnection,
    sql: string,
    page?: { readonly limit: number; readonly offset: number },
  ): Promise<DatabaseQueryEnvelope['table']> {
    const family = databaseEngineFamily(connection.type);
    if (family === 'postgresql' && session.client) {
      const client = session.client as PgClient;
      const result = await client.query(applySqlPage(sql, page));
      return envelopeFromPg(result, page);
    }
    if (family === 'mysql' && session.client) {
      const client = session.client as MysqlConnection;
      const [rows] = await client.query(applySqlPage(sql, page));
      return envelopeFromMysql(rows, page);
    }
    if (family === 'mssql' && session.client) {
      const sqlMod = loadDriver<MssqlModule>('mssql');
      const request = new sqlMod.Request(session.client as MssqlTransaction);
      const result = await request.query(applySqlPage(sql, page));
      const records = (result.recordset ?? []) as Record<string, unknown>[];
      const { columns, rows } = rowsFromRecords(records);
      return {
        columns,
        rows,
        hasMore: Boolean(page && rows.length >= page.limit),
        affectedRows: result.rowsAffected?.[0],
      };
    }
    if (family === 'oracle' && session.client) {
      const oracledb = loadDriver<OracleModule>('oracledb');
      const conn = session.client as OracleConnection;
      const result = await conn.execute(applySqlPage(sql, page), [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const records = (result.rows ?? []) as Record<string, unknown>[];
      const { columns, rows } = rowsFromRecords(records);
      return {
        columns,
        rows,
        hasMore: Boolean(page && rows.length >= page.limit),
        affectedRows: result.rowsAffected,
      };
    }
    if (family === 'sqlite')
      return this.runSqlite(connection, sql, page);
    return this.execute(connection, sql, page, undefined, true);
  }

  private async commitNative(session: PinnedSession): Promise<void> {
    if (session.type === 'mssql')
      await (session.client as MssqlTransaction).commit();
  }

  private async rollbackNative(session: PinnedSession): Promise<void> {
    if (session.type === 'mssql')
      await (session.client as MssqlTransaction).rollback();
  }

  private async execute(
    connection: DatabaseConnection,
    sql: string,
    page: { readonly limit: number; readonly offset: number } | undefined,
    timeoutMs: number | undefined,
    _inTxn: boolean,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const family = databaseEngineFamily(connection.type);
    const commandMs = timeoutMs ?? commandTimeoutMs(connection);
    if (family === 'sqlite')
      return this.runSqlite(connection, sql, page);
    if (family === 'postgresql')
      return this.runPostgres(connection, sql, page, commandMs);
    if (family === 'mysql')
      return this.runMysql(connection, sql, page, commandMs);
    if (family === 'mssql')
      return this.runMssql(connection, sql, page, commandMs);
    if (family === 'redis')
      return this.runRedis(connection, sql, commandMs);
    if (family === 'mongodb')
      return this.runMongo(connection, sql, commandMs);
    if (family === 'oracle')
      return this.runOracle(connection, sql, page, commandMs);
    throw new Error(`Unsupported database type: ${connection.type}`);
  }

  private getSqlite(connection: DatabaseConnection): SqliteDatabase {
    const Database = loadDriver<SqliteCtor>('better-sqlite3');
    const abs = resolveSqlitePath(connection);
    let entry = this.sqliteDbs.get(abs);
    if (!entry) {
      const db = new Database(abs, { timeout: busyTimeoutMs(connection) });
      entry = { db, connectionIds: new Set() };
      this.sqliteDbs.set(abs, entry);
    }
    entry.connectionIds.add(connection.id);
    return entry.db;
  }

  private runSqlite(
    connection: DatabaseConnection,
    sql: string,
    page?: { readonly limit: number; readonly offset: number },
  ): DatabaseQueryEnvelope['table'] {
    const entryDb = this.getSqlite(connection);
    const statement = applySqlPage(sql, page);
    const stmt = entryDb.prepare(statement);
    if (stmt.reader) {
      const records = stmt.all() as Record<string, unknown>[];
      const { columns, rows } = rowsFromRecords(records);
      return { columns, rows, hasMore: Boolean(page && rows.length >= page.limit) };
    }
    const info = stmt.run() as { changes?: number };
    return { columns: ['affected'], rows: [[info.changes ?? 0]], hasMore: false, affectedRows: info.changes ?? 0 };
  }

  private async runPostgres(
    connection: DatabaseConnection,
    sql: string,
    page: { readonly limit: number; readonly offset: number } | undefined,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const pool = this.getPgPool(connection);
    const result = await withTimeout(pool.query(applySqlPage(sql, page)), commandMs, 'PostgreSQL');
    return envelopeFromPg(result, page);
  }

  private async runMysql(
    connection: DatabaseConnection,
    sql: string,
    page: { readonly limit: number; readonly offset: number } | undefined,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const pool = this.getMysqlPool(connection);
    const [rows] = await withTimeout(pool.query(applySqlPage(sql, page)), commandMs, 'MySQL');
    return envelopeFromMysql(rows, page);
  }

  private async runMssql(
    connection: DatabaseConnection,
    sql: string,
    page: { readonly limit: number; readonly offset: number } | undefined,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const pool = await this.getMssqlPool(connection);
    const request = pool.request();
    if (commandMs)
      (request as { timeout?: number }).timeout = commandMs;
    const result = await request.query(applySqlPage(sql, page));
    const records = (result.recordset ?? []) as Record<string, unknown>[];
    const { columns, rows } = rowsFromRecords(records);
    return {
      columns,
      rows,
      hasMore: Boolean(page && rows.length >= page.limit),
      affectedRows: result.rowsAffected?.[0],
    };
  }

  private async runRedis(
    connection: DatabaseConnection,
    sql: string,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const client = this.getRedis(connection);
    const tokens = tokenizeRedis(sql);
    if (tokens.length === 0)
      throw new Error('Redis command is empty.');
    const result = await withTimeout(client.call(...tokens), commandMs, 'Redis');
    return {
      columns: ['result'],
      rows: [[toQueryCell(result)]],
      hasMore: false,
    };
  }

  private async runMongo(
    connection: DatabaseConnection,
    sql: string,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const client = await this.getMongo(connection);
    const dbName = connection.database || 'test';
    const db = client.db(dbName);
    const trimmed = sql.trim();
    if (trimmed === '{ "ping": 1 }' || trimmed.toLowerCase() === 'ping') {
      await withTimeout(db.command({ ping: 1 }), commandMs, 'MongoDB');
      return { columns: ['ok'], rows: [[1]], hasMore: false };
    }
    const parsed = parseMongoShell(trimmed);
    const collection = db.collection(parsed.collection);
    if (parsed.op === 'find') {
      const docs = (await withTimeout(
        collection.find(parsed.filter).limit(parsed.limit ?? 100).toArray(),
        commandMs,
        'MongoDB',
      )) as Record<string, unknown>[];
      const { columns, rows } = rowsFromRecords(docs);
      return { columns, rows, hasMore: false };
    }
    const result = await withTimeout(db.command(parsed.command), commandMs, 'MongoDB');
    const { columns, rows } = rowsFromRecords([result as Record<string, unknown>]);
    return { columns, rows, hasMore: false };
  }

  private async runOracle(
    connection: DatabaseConnection,
    sql: string,
    page: { readonly limit: number; readonly offset: number } | undefined,
    commandMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope['table']> {
    const oracledb = loadDriver<OracleModule>('oracledb');
    initOracleClient(oracledb, connection);
    const connectString = connection.useSid
      ? `${connection.host || 'localhost'}:${connection.port || 1521}:${connection.database || 'ORCL'}`
      : `${connection.host || 'localhost'}:${connection.port || 1521}/${connection.database || 'ORCL'}`;
    const conn = await oracledb.getConnection({
      user: connection.user,
      password: connection.password,
      connectString,
    });
    try {
      const result = await withTimeout(
        conn.execute(applySqlPage(sql, page), [], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
        commandMs,
        'Oracle',
      );
      const records = (result.rows ?? []) as Record<string, unknown>[];
      const { columns, rows } = rowsFromRecords(records);
      return {
        columns,
        rows,
        hasMore: Boolean(page && rows.length >= page.limit),
        affectedRows: result.rowsAffected,
      };
    } finally {
      await conn.close();
    }
  }

  private getPgPool(connection: DatabaseConnection): PgPool {
    const { Pool } = loadDriver<PgModule>('pg');
    const fingerprint = `${connection.host}|${connection.port}|${connection.database}|${connection.user}|${connection.tls ? 1 : 0}`;
    const existing = this.pgPools.get(connection.id);
    if (existing?.fingerprint === fingerprint)
      return existing.pool;
    if (existing)
      void existing.pool.end().catch(() => undefined);
    const pool = new Pool({
      host: connection.host || 'localhost',
      port: Number(connection.port) || 5432,
      user: connection.user,
      password: connection.password,
      database: connection.database || 'postgres',
      ssl: connection.tls ? { rejectUnauthorized: false } : false,
      max: 4,
      connectionTimeoutMillis: connectTimeoutMs(connection),
    });
    this.pgPools.set(connection.id, { fingerprint, pool });
    return pool;
  }

  private getMysqlPool(connection: DatabaseConnection): MysqlPool {
    const mysql = loadDriver<MysqlModule>('mysql2/promise');
    const existing = this.mysqlPools.get(connection.id);
    if (existing)
      return existing;
    const pool = mysql.createPool({
      host: connection.host || 'localhost',
      port: Number(connection.port) || 3306,
      user: connection.user || 'root',
      password: connection.password || '',
      database: connection.database || undefined,
      ssl: connection.tls ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 4,
      connectTimeout: connectTimeoutMs(connection),
    });
    this.mysqlPools.set(connection.id, pool);
    return pool;
  }

  private async getMssqlPool(connection: DatabaseConnection): Promise<MssqlPool> {
    const existing = this.mssqlPools.get(connection.id);
    if (existing)
      return existing;
    const sql = loadDriver<MssqlModule>('mssql');
    const pool = await new sql.ConnectionPool({
      user: connection.user,
      password: connection.password,
      server: connection.host || 'localhost',
      port: Number(connection.port) || 1433,
      database: connection.database,
      options: { encrypt: Boolean(connection.tls), trustServerCertificate: true },
      pool: { max: 4 },
      connectionTimeout: connectTimeoutMs(connection),
    }).connect();
    this.mssqlPools.set(connection.id, pool);
    return pool;
  }

  private getRedis(connection: DatabaseConnection): RedisClient {
    const existing = this.redisClients.get(connection.id);
    if (existing)
      return existing;
    const Redis = loadDriver<RedisCtor>('ioredis');
    const client = new Redis({
      host: connection.host || '127.0.0.1',
      port: Number(connection.port) || 6379,
      password: connection.password || undefined,
      db: connection.database ? Number.parseInt(connection.database, 10) || 0 : 0,
      tls: connection.tls ? {} : undefined,
      connectTimeout: connectTimeoutMs(connection),
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redisClients.set(connection.id, client);
    return client;
  }

  private async getMongo(connection: DatabaseConnection): Promise<MongoClient> {
    const existing = this.mongoClients.get(connection.id);
    const uri =
      connection.host?.includes('://')
        ? connection.host
        : `mongodb://${connection.user ? `${encodeURIComponent(connection.user)}:${encodeURIComponent(connection.password ?? '')}@` : ''}${connection.host || '127.0.0.1'}:${connection.port || 27017}`;
    if (existing?.fingerprint === uri)
      return existing.client;
    const { MongoClient } = loadDriver<MongoModule>('mongodb');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: connectTimeoutMs(connection) });
    await client.connect();
    if (existing)
      await existing.client.close().catch(() => undefined);
    this.mongoClients.set(connection.id, { fingerprint: uri, client });
    return client;
  }

  private recordFailure(connection: DatabaseConnection, error: unknown): Error {
    const message = formatDatabaseError(error, databaseErrorContext(connection));
    this.statuses[connection.id] = { state: 'error', message };
    return new Error(message);
  }

  private beginActivity(connectionId: string): void {
    if (!connectionId)
      return;
    this.lastActivityAt.set(connectionId, Date.now());
    this.inFlight.set(connectionId, (this.inFlight.get(connectionId) ?? 0) + 1);
  }

  private endActivity(connectionId: string): void {
    if (!connectionId)
      return;
    this.lastActivityAt.set(connectionId, Date.now());
    const next = (this.inFlight.get(connectionId) ?? 1) - 1;
    if (next <= 0)
      this.inFlight.delete(connectionId);
    else
      this.inFlight.set(connectionId, next);
  }

  private async closeConnection(connectionId: string): Promise<void> {
    const promises: Promise<unknown>[] = [];
    const redis = this.redisClients.get(connectionId);
    if (redis) {
      this.redisClients.delete(connectionId);
      promises.push(redis.quit().catch(() => undefined));
    }
    for (const [abs, entry] of [...this.sqliteDbs.entries()]) {
      if (!entry.connectionIds.has(connectionId))
        continue;
      entry.connectionIds.delete(connectionId);
      if (entry.connectionIds.size === 0) {
        this.sqliteDbs.delete(abs);
        try {
          entry.db.close();
        } catch {
          /* ignore */
        }
      }
    }
    const pg = this.pgPools.get(connectionId);
    if (pg) {
      this.pgPools.delete(connectionId);
      promises.push(pg.pool.end().catch(() => undefined));
    }
    const mysql = this.mysqlPools.get(connectionId);
    if (mysql) {
      this.mysqlPools.delete(connectionId);
      promises.push(mysql.end().catch(() => undefined));
    }
    const mssql = this.mssqlPools.get(connectionId);
    if (mssql) {
      this.mssqlPools.delete(connectionId);
      promises.push(mssql.close().catch(() => undefined));
    }
    const mongo = this.mongoClients.get(connectionId);
    if (mongo) {
      this.mongoClients.delete(connectionId);
      promises.push(mongo.client.close().catch(() => undefined));
    }
    this.lastActivityAt.delete(connectionId);
    this.inFlight.delete(connectionId);
    await Promise.allSettled(promises);
  }

  private collectClosePromises(): Promise<unknown>[] {
    const promises: Promise<unknown>[] = [];
    for (const client of this.redisClients.values())
      promises.push(client.quit().catch(() => undefined));
    for (const entry of this.sqliteDbs.values()) {
      try {
        entry.db.close();
      } catch {
        /* ignore */
      }
    }
    for (const entry of this.pgPools.values())
      promises.push(entry.pool.end().catch(() => undefined));
    for (const pool of this.mysqlPools.values())
      promises.push(pool.end().catch(() => undefined));
    for (const pool of this.mssqlPools.values())
      promises.push(pool.close().catch(() => undefined));
    for (const entry of this.mongoClients.values())
      promises.push(entry.client.close().catch(() => undefined));
    return promises;
  }
}

function envelopeFromPg(
  result: { rows?: Record<string, unknown>[]; rowCount?: number },
  page?: { readonly limit: number; readonly offset: number },
): DatabaseQueryEnvelope['table'] {
  const { columns, rows } = rowsFromRecords(result.rows ?? []);
  return {
    columns,
    rows,
    hasMore: Boolean(page && rows.length >= page.limit),
    affectedRows: result.rowCount,
  };
}

function envelopeFromMysql(
  rows: unknown,
  page?: { readonly limit: number; readonly offset: number },
): DatabaseQueryEnvelope['table'] {
  if (Array.isArray(rows)) {
    const records = rows as Record<string, unknown>[];
    const shaped = rowsFromRecords(records);
    return {
      columns: shaped.columns,
      rows: shaped.rows,
      hasMore: Boolean(page && shaped.rows.length >= page.limit),
    };
  }
  const header = rows as { affectedRows?: number };
  return {
    columns: ['affected'],
    rows: [[header.affectedRows ?? 0]],
    hasMore: false,
    affectedRows: header.affectedRows,
  };
}

function probeSql(connection: DatabaseConnection): string {
  const family = databaseEngineFamily(connection.type);
  if (family === 'oracle')
    return 'SELECT 1 AS ok FROM DUAL';
  if (family === 'redis')
    return 'PING';
  if (family === 'mongodb')
    return '{ "ping": 1 }';
  return 'SELECT 1 AS ok';
}

function tokenizeRedis(source: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)))
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  return tokens;
}

function parseMongoShell(source: string): {
  readonly op: 'find' | 'command';
  readonly collection: string;
  readonly filter: Record<string, unknown>;
  readonly limit?: number;
  readonly command: Record<string, unknown>;
} {
  const find = source.match(/^db\.(\w+)\.find\((.*)\)/s);
  if (find) {
    let filter: Record<string, unknown> = {};
    try {
      filter = find[2]?.trim() ? (JSON.parse(find[2]) as Record<string, unknown>) : {};
    } catch {
      filter = {};
    }
    return { op: 'find', collection: find[1] ?? 'collection', filter, limit: 100, command: {} };
  }
  try {
    return {
      op: 'command',
      collection: '',
      filter: {},
      command: JSON.parse(source) as Record<string, unknown>,
    };
  } catch {
    throw new Error('MongoDB query must be db.collection.find({}) or a JSON command.');
  }
}

interface SqliteDatabase {
  prepare(sql: string): { reader: boolean; all: () => unknown; run: () => unknown };
  close(): void;
}
type SqliteCtor = new (path: string, options?: { timeout?: number }) => SqliteDatabase;

interface PgClient {
  query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
  release(): void;
}
interface PgPool {
  connect(): Promise<PgClient>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
  end(): Promise<void>;
}
interface PgModule {
  Pool: new (config: Record<string, unknown>) => PgPool;
}

interface MysqlConnection {
  query(sql: string): Promise<[unknown, unknown]>;
  release(): void;
}
interface MysqlPool {
  query(sql: string): Promise<[unknown, unknown]>;
  getConnection(): Promise<MysqlConnection>;
  end(): Promise<void>;
}
interface MysqlModule {
  createPool(config: Record<string, unknown>): MysqlPool;
}

interface MssqlTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
interface MssqlPool {
  request(): { query(sql: string): Promise<{ recordset?: Record<string, unknown>[]; rowsAffected?: number[] }> };
  close(): Promise<void>;
}
interface MssqlModule {
  ConnectionPool: new (config: Record<string, unknown>) => { connect(): Promise<MssqlPool> };
  Transaction: new (pool: MssqlPool) => MssqlTransaction;
  Request: new (parent: MssqlTransaction | MssqlPool) => {
    query(sql: string): Promise<{ recordset?: Record<string, unknown>[]; rowsAffected?: number[] }>;
  };
}

interface RedisClient {
  call(...tokens: string[]): Promise<unknown>;
  quit(): Promise<unknown>;
}
type RedisCtor = new (config: Record<string, unknown>) => RedisClient;

interface MongoClient {
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  db(name: string): {
    command(cmd: Record<string, unknown>): Promise<unknown>;
    collection(name: string): {
      find(filter: Record<string, unknown>): { limit(n: number): { toArray(): Promise<unknown[]> } };
    };
  };
}
interface MongoModule {
  MongoClient: new (uri: string, options?: Record<string, unknown>) => MongoClient;
}

interface OracleConnection {
  execute(
    sql: string,
    binds: unknown[],
    options: Record<string, unknown>,
  ): Promise<{ rows?: Record<string, unknown>[]; rowsAffected?: number }>;
  close(): Promise<void>;
}

interface OracleModule {
  OUT_FORMAT_OBJECT: number;
  initOracleClient?(config: { libDir?: string }): void;
  getConnection(config: Record<string, unknown>): Promise<OracleConnection>;
}

function initOracleClient(oracledb: OracleModule, connection: DatabaseConnection): void {
  if (usesOracleThin(connection) || !oracledb.initOracleClient)
    return;
  try {
    const libDir = connection.clientPath?.trim();
    oracledb.initOracleClient(libDir ? { libDir } : {});
  } catch {
    /* already initialized */
  }
}

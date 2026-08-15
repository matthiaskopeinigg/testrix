import path from 'node:path';

import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { Pool as PgPool, Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import sqlMssql from 'mssql';
import oracledb, { type Pool as OraclePool } from 'oracledb';
import { MongoClient } from 'mongodb';
import { createClient, type ClickHouseClient } from '@clickhouse/client';

import type { DatabaseConnection } from '../../../shared/config/database-settings.schema';
import type { DatabaseQueryEnvelope } from '../../../shared/database/database-introspect.schema';
import { tokenizeRedisQuery } from '../../../shared/database/tokenize-redis-query';
import {
  postgresPoolFingerprint,
  resolvePostgresDatabaseName,
} from '../../../shared/database/resolve-postgres-database';
import { databaseEngineFamily } from '../../../shared/database/database-engine';
import { resolveOracleConnectString } from '../../../shared/database/oracle-connect-string';
import { resolveMongoConnectionUri } from '../../../shared/database/mongo-connection-uri';
import { parseMongoShellQuery } from '../../../shared/database/mongo-shell-query';
import { logError, logInfo } from '../../errors/logger';

export interface DatabaseQueryOptions {
  readonly stepTimeoutMs?: number;
}

/**
 * Executes database queries with session-level connection pooling.
 */
export class DatabaseQueryService {
  private readonly redisPool = new Map<string, Redis>();
  private readonly sqliteDbs = new Map<string, Database.Database>();
  private readonly pgPools = new Map<string, { fingerprint: string; pool: PgPool }>();
  private readonly mysqlPools = new Map<string, mysql.Pool>();
  private readonly mssqlPools = new Map<string, sqlMssql.ConnectionPool>();
  private readonly oraclePools = new Map<string, { fingerprint: string; pool: OraclePool }>();
  private readonly mongoClients = new Map<string, { fingerprint: string; client: MongoClient }>();
  private readonly clickhouseClients = new Map<string, { fingerprint: string; client: ClickHouseClient }>();

  /**
   * Runs a query against the given connection profile.
   */
  async query(
    connection: DatabaseConnection,
    queryText: string,
    options: DatabaseQueryOptions = {},
  ): Promise<DatabaseQueryEnvelope> {
    if (!connection || !queryText) {
      throw new Error('Connection and query are required');
    }
    const stepMs = options.stepTimeoutMs;
    const family = databaseEngineFamily(connection.type);
    if (family === 'redis') {
      return this.runRedis(connection, queryText, stepMs);
    }
    if (family === 'sqlite') {
      return this.runSqlite(connection, queryText);
    }
    if (family === 'postgresql') {
      return this.runPostgres(connection, queryText, stepMs);
    }
    if (family === 'mysql') {
      return this.runMysql(connection, queryText, stepMs);
    }
    if (family === 'mssql') {
      return this.runMssql(connection, queryText, stepMs);
    }
    if (family === 'oracle') {
      return this.runOracle(connection, queryText, stepMs);
    }
    if (family === 'clickhouse') {
      return this.runClickhouse(connection, queryText, stepMs);
    }
    if (family === 'mongodb') {
      return this.runMongo(connection, queryText, stepMs);
    }
    throw new Error(`Unsupported database type: ${connection.type}`);
  }

  /**
   * Light probe for the Settings "Test connection" button.
   */
  async testConnection(connection: DatabaseConnection): Promise<unknown> {
    const t = String(connection.type || '').toLowerCase();
    const family = databaseEngineFamily(connection.type);
    const connectMs = this.connectTimeoutMs(connection);
    const commandMs = this.commandTimeoutMs(connection);

    if (family === 'redis' || t === 'redis') {
      const client = new Redis({
        host: connection.host || '127.0.0.1',
        port: Number(connection.port) || 6379,
        password: connection.password || undefined,
        db: connection.database ? parseInt(String(connection.database), 10) : 0,
        tls: connection.tls ? {} : undefined,
        connectTimeout: connectMs,
        commandTimeout: commandMs,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: false,
      });
      try {
        const ping = commandMs
          ? await this.withOptionalTimeout(client.ping(), commandMs, 'PING')
          : await client.ping();
        return ping;
      } finally {
        try {
          await client.quit();
        } catch {
          try {
            client.disconnect();
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (family === 'sqlite' || t === 'sqlite') {
      return this.query(connection, 'SELECT 1 AS ok');
    }

    if (family === 'postgresql' || t === 'postgresql') {
      const client = new PgClient({
        host: connection.host || 'localhost',
        port: Number(connection.port) || 5432,
        user: connection.user,
        password: connection.password,
        database: resolvePostgresDatabaseName(connection.database),
        ssl: connection.tls ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: connectMs,
      });
      await client.connect();
      try {
        const q = client.query('SELECT 1');
        const res = await this.withOptionalTimeout(q, commandMs, 'Query');
        return res.rows;
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (family === 'mysql') {
      const conn = await mysql.createConnection({
        host: connection.host || 'localhost',
        port: Number(connection.port) || 3306,
        user: connection.user || 'root',
        password: connection.password || '',
        database: connection.database || undefined,
        ssl: connection.tls ? {} : undefined,
        connectTimeout: connectMs,
      });
      try {
        const p = conn.query('SELECT 1');
        const [rows] = await this.withOptionalTimeout(p, commandMs, 'Query');
        return rows;
      } finally {
        await conn.end().catch(() => {});
      }
    }

    if (family === 'mssql') {
      const cfg: sqlMssql.config = {
        user: connection.user,
        password: connection.password,
        server: connection.host || 'localhost',
        port: Number(connection.port) || 1433,
        database: connection.database,
        options: {
          encrypt: !!connection.tls,
          trustServerCertificate: true,
        },
        pool: { max: 1 },
        connectionTimeout: connectMs,
      };
      const pool = new sqlMssql.ConnectionPool(cfg);
      await pool.connect();
      try {
        const req = pool.request();
        if (commandMs) {
          (req as sqlMssql.Request & { timeout?: number }).timeout = commandMs;
        }
        const res = await req.query('SELECT 1');
        return res.recordset;
      } finally {
        await pool.close().catch(() => {});
      }
    }

    if (family === 'oracle') {
      return this.query(connection, 'SELECT 1 AS ok FROM DUAL');
    }
    if (family === 'clickhouse') {
      return this.query(connection, 'SELECT 1 AS ok');
    }
    if (family === 'mongodb') {
      return this.query(connection, '{ "ping": 1 }');
    }

    throw new Error(`Unsupported database type: ${connection.type}`);
  }

  /** Closes all pooled connections. Call on app quit. */
  async closeAll(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const c of this.redisPool.values()) {
      promises.push(c.quit().catch(() => {}));
    }
    this.redisPool.clear();
    for (const d of this.sqliteDbs.values()) {
      try {
        d.close();
      } catch {
        /* ignore */
      }
    }
    this.sqliteDbs.clear();
    for (const entry of this.pgPools.values()) {
      promises.push(entry.pool.end().catch(() => {}));
    }
    this.pgPools.clear();
    for (const p of this.mysqlPools.values()) {
      promises.push(p.end().catch(() => {}));
    }
    this.mysqlPools.clear();
    for (const p of this.mssqlPools.values()) {
      promises.push(p.close().catch(() => {}));
    }
    this.mssqlPools.clear();
    for (const entry of this.oraclePools.values()) {
      promises.push(entry.pool.close(0).catch(() => {}));
    }
    this.oraclePools.clear();
    for (const entry of this.mongoClients.values()) {
      promises.push(entry.client.close().catch(() => {}));
    }
    this.mongoClients.clear();
    for (const entry of this.clickhouseClients.values()) {
      promises.push(entry.client.close().catch(() => {}));
    }
    this.clickhouseClients.clear();
    await Promise.allSettled(promises);
  }

  private connectTimeoutMs(conn: DatabaseConnection): number {
    const n = Number(conn.connectTimeoutMs);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 600_000) : 10_000;
  }

  private commandTimeoutMs(conn: DatabaseConnection): number | undefined {
    const n = Number(conn.commandTimeoutMs);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 3_600_000) : undefined;
  }

  private effectiveCommandMs(
    connection: DatabaseConnection,
    stepTimeoutMs: number | undefined,
  ): number | undefined {
    const cap = 3_600_000;
    if (stepTimeoutMs != null && Number.isFinite(stepTimeoutMs) && stepTimeoutMs > 0) {
      return Math.min(Math.floor(stepTimeoutMs), cap);
    }
    return this.commandTimeoutMs(connection);
  }

  private busyTimeoutMs(conn: DatabaseConnection): number {
    const n = Number(conn.busyTimeoutMs);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 300_000) : 5000;
  }

  private async withOptionalTimeout<T>(
    promise: Promise<T>,
    ms: number | undefined,
    label: string,
  ): Promise<T> {
    if (ms == null || ms <= 0) {
      return promise;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private resolveSqlitePath(conn: DatabaseConnection): string {
    const raw = conn.filePath || conn.database;
    if (!raw || typeof raw !== 'string') {
      throw new Error('SQLite connection needs filePath (or database as file path)');
    }
    return path.resolve(raw);
  }

  private getSqlite(conn: DatabaseConnection): Database.Database {
    const abs = this.resolveSqlitePath(conn);
    const busy = this.busyTimeoutMs(conn);
    if (!this.sqliteDbs.has(abs)) {
      logInfo(`Opening SQLite database: ${abs}`);
      this.sqliteDbs.set(abs, new Database(abs, { timeout: busy }));
    } else {
      try {
        this.sqliteDbs.get(abs)!.pragma(`busy_timeout = ${busy}`);
      } catch {
        /* ignore */
      }
    }
    return this.sqliteDbs.get(abs)!;
  }

  private pgConfig(conn: DatabaseConnection): ConstructorParameters<typeof PgPool>[0] {
    return {
      host: conn.host || 'localhost',
      port: Number(conn.port) || 5432,
      user: conn.user,
      password: conn.password,
      database: resolvePostgresDatabaseName(conn.database),
      ssl: conn.tls ? { rejectUnauthorized: false } : false,
      max: 4,
      connectionTimeoutMillis: this.connectTimeoutMs(conn),
    };
  }

  private getPgPool(conn: DatabaseConnection): PgPool {
    const id = conn.id || `pg:${conn.host}:${conn.port}:${conn.database ?? ''}`;
    const fingerprint = postgresPoolFingerprint(conn);
    const existing = this.pgPools.get(id);
    if (existing?.fingerprint === fingerprint) {
      return existing.pool;
    }
    if (existing) {
      void existing.pool.end().catch(() => {});
    }
    const pool = new PgPool(this.pgConfig(conn));
    this.pgPools.set(id, { fingerprint, pool });
    return pool;
  }

  private async getMysqlPool(conn: DatabaseConnection): Promise<mysql.Pool> {
    const id = conn.id || `my:${conn.host}:${conn.port}`;
    if (!this.mysqlPools.has(id)) {
      const pool = mysql.createPool({
        host: conn.host || 'localhost',
        port: Number(conn.port) || 3306,
        user: conn.user || 'root',
        password: conn.password || '',
        database: conn.database || undefined,
        ssl: conn.tls ? {} : undefined,
        waitForConnections: true,
        connectionLimit: 4,
        connectTimeout: this.connectTimeoutMs(conn),
      });
      this.mysqlPools.set(id, pool);
    }
    return this.mysqlPools.get(id)!;
  }

  private async getMssqlPool(conn: DatabaseConnection): Promise<sqlMssql.ConnectionPool> {
    const id = conn.id || `mssql:${conn.host}:${conn.port}`;
    if (!this.mssqlPools.has(id)) {
      const config: sqlMssql.config = {
        user: conn.user,
        password: conn.password,
        server: conn.host || 'localhost',
        port: Number(conn.port) || 1433,
        database: conn.database,
        options: {
          encrypt: !!conn.tls,
          trustServerCertificate: true,
        },
        pool: { max: 4 },
        connectionTimeout: this.connectTimeoutMs(conn),
      };
      this.mssqlPools.set(id, await new sqlMssql.ConnectionPool(config).connect());
    }
    return this.mssqlPools.get(id)!;
  }

  private async getOraclePool(conn: DatabaseConnection): Promise<OraclePool> {
    ensureOracleDefaults();
    const id = conn.id || `oracle:${conn.host}:${conn.port}:${conn.database ?? ''}`;
    const fingerprint = [
      conn.host,
      conn.port,
      conn.user,
      conn.password,
      conn.database,
      conn.tls ? '1' : '0',
    ].join('\0');
    const existing = this.oraclePools.get(id);
    if (existing?.fingerprint === fingerprint) {
      return existing.pool;
    }
    if (existing) {
      void existing.pool.close(0).catch(() => {});
    }
    const pool = await oracledb.createPool({
      user: conn.user,
      password: conn.password,
      connectString: resolveOracleConnectString(conn),
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,
      connectTimeout: Math.ceil(this.connectTimeoutMs(conn) / 1000),
    });
    this.oraclePools.set(id, { fingerprint, pool });
    return pool;
  }

  private async getMongoClient(conn: DatabaseConnection): Promise<MongoClient> {
    const id = conn.id || `mongo:${conn.host}:${conn.port}`;
    const fingerprint = resolveMongoConnectionUri(conn);
    const existing = this.mongoClients.get(id);
    if (existing?.fingerprint === fingerprint) {
      return existing.client;
    }
    if (existing) {
      void existing.client.close().catch(() => {});
    }
    const client = new MongoClient(fingerprint, {
      serverSelectionTimeoutMS: this.connectTimeoutMs(conn),
    });
    await client.connect();
    this.mongoClients.set(id, { fingerprint, client });
    return client;
  }

  private getClickhouseClient(conn: DatabaseConnection): ClickHouseClient {
    const id = conn.id || `ch:${conn.host}:${conn.port}`;
    const protocol = conn.tls ? 'https' : 'http';
    const port = Number(conn.port) || 8123;
    const url = `${protocol}://${conn.host || 'localhost'}:${port}`;
    const fingerprint = [url, conn.user, conn.password, conn.database].join('\0');
    const existing = this.clickhouseClients.get(id);
    if (existing?.fingerprint === fingerprint) {
      return existing.client;
    }
    if (existing) {
      void existing.client.close().catch(() => {});
    }
    const client = createClient({
      url,
      username: conn.user || 'default',
      password: conn.password || '',
      database: conn.database || 'default',
      request_timeout: this.connectTimeoutMs(conn),
    });
    this.clickhouseClients.set(id, { fingerprint, client });
    return client;
  }

  private runSqlite(config: DatabaseConnection, queryText: string): DatabaseQueryEnvelope {
    const db = this.getSqlite(config);
    const q = String(queryText).trim();
    if (!q) {
      return { rows: [] };
    }
    const lower = q.toLowerCase();
    if (
      lower.startsWith('select') ||
      lower.startsWith('pragma') ||
      lower.startsWith('explain') ||
      lower.startsWith('with')
    ) {
      return { rows: db.prepare(q).all() };
    }
    const info = db.prepare(q).run();
    return {
      rows: { changes: info.changes, lastInsertRowid: info.lastInsertRowid },
      affectedRows: info.changes,
    };
  }

  private async runPostgres(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const pool = this.getPgPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const res = await this.withOptionalTimeout(pool.query(queryText), cmdMs, 'Query');
    const command = String(res.command ?? '').toUpperCase();
    const dml = command === 'INSERT' || command === 'UPDATE' || command === 'DELETE' || command === 'MERGE';
    return {
      rows: res.rows,
      affectedRows: dml && typeof res.rowCount === 'number' ? res.rowCount : undefined,
      columnTypes: mapPgColumnTypes(res.fields),
    };
  }

  private async runMysql(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const pool = await this.getMysqlPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const [rows, fields] = await this.withOptionalTimeout(pool.query(queryText), cmdMs, 'Query');
    if (rows && typeof rows === 'object' && !Array.isArray(rows) && 'affectedRows' in rows) {
      const header = rows as { affectedRows?: number; insertId?: number };
      return {
        rows: header,
        affectedRows: header.affectedRows,
      };
    }
    return {
      rows,
      columnTypes: mapMysqlColumnTypes(fields),
    };
  }

  private async runMssql(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const pool = await this.getMssqlPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const req = pool.request();
    if (cmdMs) {
      (req as sqlMssql.Request & { timeout?: number }).timeout = cmdMs;
    }
    const res = await req.query(queryText);
    const rows = res.recordset ?? [];
    const affected =
      Array.isArray(res.rowsAffected) && res.rowsAffected.length > 0
        ? res.rowsAffected.reduce((sum, n) => sum + n, 0)
        : undefined;
    const dml = /^\s*(insert|update|delete|merge)\b/i.test(queryText);
    return {
      rows,
      affectedRows: dml ? affected : undefined,
    };
  }

  private async runOracle(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const pool = await this.getOraclePool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const connection = await pool.getConnection();
    try {
      const result = await this.withOptionalTimeout(
        connection.execute(queryText, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false,
        }),
        cmdMs,
        'Query',
      );
      const rows = (result.rows ?? []).map((row) => mapOracleRow(row));
      const dml = /^\s*(insert|update|delete|merge)\b/i.test(queryText);
      return {
        rows,
        affectedRows: dml && typeof result.rowsAffected === 'number' ? result.rowsAffected : undefined,
        columnTypes: mapOracleColumnTypes(result.metaData),
      };
    } finally {
      await connection.close().catch(() => {});
    }
  }

  private async runClickhouse(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const client = this.getClickhouseClient(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const trimmed = queryText.trim();
    const reads = /^(select|show|describe|desc|explain|with|exists|call)\b/i.test(trimmed);
    if (reads) {
      const result = await this.withOptionalTimeout(
        client.query({ query: queryText, format: 'JSONEachRow' }),
        cmdMs,
        'Query',
      );
      const rows = await result.json();
      return { rows: Array.isArray(rows) ? rows : [] };
    }
    await this.withOptionalTimeout(client.command({ query: queryText }), cmdMs, 'Query');
    return { rows: [] };
  }

  private async runMongo(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const client = await this.getMongoClient(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const parsed = parseMongoShellQuery(queryText, config.database);
    const exec = this.dispatchMongo(client, parsed, config.database);
    const rows = await this.withOptionalTimeout(exec, cmdMs, 'MongoDB command');
    return { rows };
  }

  private async dispatchMongo(
    client: MongoClient,
    parsed: ReturnType<typeof parseMongoShellQuery>,
    fallbackDatabase: string | undefined,
  ): Promise<unknown> {
    if (parsed.kind === 'listDatabases') {
      const listed = await client.db().admin().listDatabases();
      return listed.databases.map((entry) => ({ name: entry.name, sizeOnDisk: entry.sizeOnDisk }));
    }
    const database = parsed.kind === 'command' || parsed.kind === 'listCollections'
      ? parsed.database || fallbackDatabase
      : 'database' in parsed
        ? parsed.database || fallbackDatabase
        : fallbackDatabase;
    const db = client.db(database || undefined);
    if (parsed.kind === 'listCollections') {
      const names = await db.listCollections().toArray();
      return names.map((entry) => ({ name: entry.name, type: entry.type ?? 'collection' }));
    }
    if (parsed.kind === 'command') {
      return db.command(parsed.command);
    }
    const collection = db.collection(parsed.collection);
    switch (parsed.kind) {
      case 'find': {
        let cursor = collection.find(asFilter(parsed.filter));
        if (parsed.projection && typeof parsed.projection === 'object') {
          cursor = cursor.project(parsed.projection as Record<string, unknown>);
        }
        if (parsed.skip) {
          cursor = cursor.skip(parsed.skip);
        }
        if (parsed.limit) {
          cursor = cursor.limit(parsed.limit);
        }
        return cursor.toArray();
      }
      case 'findOne':
        return collection.findOne(
          asFilter(parsed.filter),
          parsed.projection && typeof parsed.projection === 'object'
            ? { projection: parsed.projection as Record<string, unknown> }
            : undefined,
        );
      case 'aggregate':
        return collection.aggregate(parsed.pipeline as object[]).toArray();
      case 'insertOne': {
        const result = await collection.insertOne(parsed.document as never);
        return { insertedId: result.insertedId, acknowledged: result.acknowledged };
      }
      case 'insertMany': {
        const result = await collection.insertMany(parsed.documents as never[]);
        return { insertedCount: result.insertedCount, acknowledged: result.acknowledged };
      }
      case 'updateOne': {
        const result = await collection.updateOne(asFilter(parsed.filter), parsed.update as never);
        return {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          acknowledged: result.acknowledged,
        };
      }
      case 'updateMany': {
        const result = await collection.updateMany(asFilter(parsed.filter), parsed.update as never);
        return {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          acknowledged: result.acknowledged,
        };
      }
      case 'deleteOne': {
        const result = await collection.deleteOne(asFilter(parsed.filter));
        return { deletedCount: result.deletedCount, acknowledged: result.acknowledged };
      }
      case 'deleteMany': {
        const result = await collection.deleteMany(asFilter(parsed.filter));
        return { deletedCount: result.deletedCount, acknowledged: result.acknowledged };
      }
      case 'countDocuments':
        return { count: await collection.countDocuments(asFilter(parsed.filter)) };
      case 'listIndexes':
        return collection.indexes();
      default:
        throw new Error('Unsupported MongoDB command');
    }
  }

  private async runRedis(
    config: DatabaseConnection,
    query: string,
    stepTimeoutMs: number | undefined,
  ): Promise<DatabaseQueryEnvelope> {
    const poolId = config.id || `${config.host}:${config.port}`;
    let client = this.redisPool.get(poolId);
    if (!client) {
      logInfo(`Creating new Redis client for ${config.host}:${config.port}`);
      client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.database ? parseInt(String(config.database), 10) : 0,
        tls: config.tls ? {} : undefined,
        connectTimeout: this.connectTimeoutMs(config),
        commandTimeout: this.commandTimeoutMs(config),
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });
      client.on('error', (err) => {
        logError(() => '', `Redis client error [${poolId}]`, err);
      });
      this.redisPool.set(poolId, client);
    }
    const parts = tokenizeRedisQuery(query);
    const command = parts[0]?.toLowerCase();
    if (!command) {
      throw new Error('Redis command is required');
    }
    const args = parts.slice(1);
    const fn = (client as unknown as Record<string, unknown>)[command];
    if (typeof fn !== 'function') {
      throw new Error(`Unsupported Redis command: ${command}`);
    }
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const exec = (fn as (...a: string[]) => unknown).call(client, ...args);
    return {
      rows: await this.withOptionalTimeout(Promise.resolve(exec as Promise<unknown>), cmdMs, 'Redis command'),
    };
  }
}

const PG_OID_NAMES: Record<number, string> = {
  16: 'bool',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  114: 'json',
  700: 'float4',
  701: 'float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1114: 'timestamp',
  1184: 'timestamptz',
  1700: 'numeric',
  2950: 'uuid',
  3802: 'jsonb',
};

function mapPgColumnTypes(fields: readonly { dataTypeID?: number }[] | undefined): string[] | undefined {
  if (!fields?.length) {
    return undefined;
  }
  const types = fields.map((field) => PG_OID_NAMES[field.dataTypeID ?? -1] ?? '');
  return types.some((type) => type.length > 0) ? types : undefined;
}

const MYSQL_TYPE_NAMES: Record<number, string> = {
  0: 'decimal',
  1: 'tinyint',
  2: 'smallint',
  3: 'int',
  4: 'float',
  5: 'double',
  7: 'timestamp',
  8: 'bigint',
  10: 'date',
  12: 'datetime',
  15: 'varchar',
  245: 'json',
  246: 'decimal',
  253: 'varchar',
  254: 'char',
};

function mapMysqlColumnTypes(fields: unknown): string[] | undefined {
  if (!Array.isArray(fields) || fields.length === 0) {
    return undefined;
  }
  const types = fields.map((field) => {
    const typeId = Number((field as { columnType?: number; type?: number }).columnType ?? (field as { type?: number }).type);
    return MYSQL_TYPE_NAMES[typeId] ?? '';
  });
  return types.some((type) => type.length > 0) ? types : undefined;
}

let oracleDefaultsApplied = false;

function ensureOracleDefaults(): void {
  if (oracleDefaultsApplied) {
    return;
  }
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
  oracleDefaultsApplied = true;
}

function mapOracleRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[key] = value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : value;
  }
  return out;
}

function mapOracleColumnTypes(
  meta: readonly { dbTypeName?: string }[] | undefined,
): string[] | undefined {
  if (!meta?.length) {
    return undefined;
  }
  const types = meta.map((field) => field.dbTypeName ?? '');
  return types.some((type) => type.length > 0) ? types : undefined;
}

function asFilter(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Shared singleton for the app session. */
export const databaseQueryService = new DatabaseQueryService();

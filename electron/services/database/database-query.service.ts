import path from 'node:path';

import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { Pool as PgPool, Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import sqlMssql from 'mssql';

import type { DatabaseConnection } from '../../../shared/config/database-settings.schema';
import { tokenizeRedisQuery } from '../../../shared/database/tokenize-redis-query';
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
  private readonly pgPools = new Map<string, PgPool>();
  private readonly mysqlPools = new Map<string, mysql.Pool>();
  private readonly mssqlPools = new Map<string, sqlMssql.ConnectionPool>();

  /**
   * Runs a query against the given connection profile.
   */
  async query(
    connection: DatabaseConnection,
    queryText: string,
    options: DatabaseQueryOptions = {},
  ): Promise<unknown> {
    if (!connection || !queryText) {
      throw new Error('Connection and query are required');
    }
    const stepMs = options.stepTimeoutMs;
    const t = String(connection.type || '').toLowerCase();
    if (t === 'redis') {
      return this.runRedis(connection, queryText, stepMs);
    }
    if (t === 'sqlite') {
      return this.runSqlite(connection, queryText);
    }
    if (t === 'postgresql') {
      return this.runPostgres(connection, queryText, stepMs);
    }
    if (t === 'mysql') {
      return this.runMysql(connection, queryText, stepMs);
    }
    if (t === 'mssql') {
      return this.runMssql(connection, queryText, stepMs);
    }
    throw new Error(`Unsupported database type: ${connection.type}`);
  }

  /**
   * Light probe for the Settings "Test connection" button.
   */
  async testConnection(connection: DatabaseConnection): Promise<unknown> {
    const t = String(connection.type || '').toLowerCase();
    const connectMs = this.connectTimeoutMs(connection);
    const commandMs = this.commandTimeoutMs(connection);

    if (t === 'redis') {
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

    if (t === 'sqlite') {
      return this.query(connection, 'SELECT 1 AS ok');
    }

    if (t === 'postgresql') {
      const client = new PgClient({
        host: connection.host || 'localhost',
        port: Number(connection.port) || 5432,
        user: connection.user,
        password: connection.password,
        database: connection.database || 'postgres',
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

    if (t === 'mysql') {
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

    if (t === 'mssql') {
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
    for (const p of this.pgPools.values()) {
      promises.push(p.end().catch(() => {}));
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
      database: conn.database || 'postgres',
      ssl: conn.tls ? { rejectUnauthorized: false } : false,
      max: 4,
      connectionTimeoutMillis: this.connectTimeoutMs(conn),
    };
  }

  private getPgPool(conn: DatabaseConnection): PgPool {
    const id = conn.id || `pg:${conn.host}:${conn.port}:${conn.database}`;
    if (!this.pgPools.has(id)) {
      this.pgPools.set(id, new PgPool(this.pgConfig(conn)));
    }
    return this.pgPools.get(id)!;
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

  private runSqlite(config: DatabaseConnection, queryText: string): unknown {
    const db = this.getSqlite(config);
    const q = String(queryText).trim();
    if (!q) {
      return [];
    }
    const lower = q.toLowerCase();
    if (lower.startsWith('select') || lower.startsWith('pragma')) {
      return db.prepare(q).all();
    }
    const info = db.prepare(q).run();
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  }

  private async runPostgres(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<unknown> {
    const pool = this.getPgPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const res = await this.withOptionalTimeout(pool.query(queryText), cmdMs, 'Query');
    return res.rows;
  }

  private async runMysql(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<unknown> {
    const pool = await this.getMysqlPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const [rows] = await this.withOptionalTimeout(pool.query(queryText), cmdMs, 'Query');
    return rows;
  }

  private async runMssql(
    config: DatabaseConnection,
    queryText: string,
    stepTimeoutMs: number | undefined,
  ): Promise<unknown> {
    const pool = await this.getMssqlPool(config);
    const cmdMs = this.effectiveCommandMs(config, stepTimeoutMs);
    const req = pool.request();
    if (cmdMs) {
      (req as sqlMssql.Request & { timeout?: number }).timeout = cmdMs;
    }
    const res = await req.query(queryText);
    return res.recordset;
  }

  private async runRedis(
    config: DatabaseConnection,
    query: string,
    stepTimeoutMs: number | undefined,
  ): Promise<unknown> {
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
    return await this.withOptionalTimeout(Promise.resolve(exec as Promise<unknown>), cmdMs, 'Redis command');
  }
}

/** Shared singleton for the app session. */
export const databaseQueryService = new DatabaseQueryService();

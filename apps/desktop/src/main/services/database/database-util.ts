import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseConnection } from '@testrix/contracts';
import { appLogger } from '@testrix/electron-core';

const require = createRequire(__filename);

export function loadDriver<T>(name: string): T {
  try {
    return require(name) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Database driver "${name}" is not available (${reason}).`);
  }
}

export function toQueryCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined)
    return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (value instanceof Date)
    return value.toISOString();
  if (Buffer.isBuffer(value))
    return value.toString('hex');
  if (typeof value === 'bigint')
    return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function rowsFromRecords(
  records: readonly Record<string, unknown>[],
): { columns: string[]; rows: (string | number | boolean | null)[][] } {
  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key))
        columns.push(key);
    }
  }
  const rows = records.map((record) => columns.map((column) => toQueryCell(record[column])));
  return { columns, rows };
}

export function connectTimeoutMs(connection: DatabaseConnection): number {
  const n = Number(connection.connectTimeoutMs);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 600_000) : 10_000;
}

export function commandTimeoutMs(connection: DatabaseConnection): number | undefined {
  const n = Number(connection.commandTimeoutMs);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 3_600_000) : undefined;
}

export function busyTimeoutMs(connection: DatabaseConnection): number {
  const n = Number(connection.busyTimeoutMs);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 300_000) : 5000;
}

export function resolveSqlitePath(connection: DatabaseConnection): string {
  const raw = connection.filePath || connection.database;
  if (!raw)
    throw new Error('SQLite connection needs a file path.');
  return path.resolve(raw);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number | undefined, label: string): Promise<T> {
  if (ms == null || ms <= 0)
    return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}

export function applySqlPage(sql: string, page?: { readonly limit: number; readonly offset: number }): string {
  if (!page)
    return sql;
  const trimmed = sql.trim().replace(/;+\s*$/u, '');
  return `${trimmed} LIMIT ${Math.max(0, page.limit)} OFFSET ${Math.max(0, page.offset)}`;
}

export function logDatabase(message: string): void {
  appLogger.info('database', message);
}

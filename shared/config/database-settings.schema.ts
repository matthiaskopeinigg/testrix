import { z } from 'zod';

export const DATABASE_TYPE_IDS = [
  'redis',
  'postgresql',
  'mysql',
  'mssql',
  'sqlite',
] as const;

export const databaseTypeSchema = z.enum(DATABASE_TYPE_IDS);
export type DatabaseType = z.infer<typeof databaseTypeSchema>;

export const databaseConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: databaseTypeSchema,
  host: z.string().default('localhost'),
  port: z.number().int().default(5432),
  user: z.string().optional(),
  password: z.string().optional(),
  /** DB name (SQL) or Redis logical DB index, depending on `type`. */
  database: z.string().optional(),
  /** SQLite file path (when `type` is `sqlite`); if set, host/port are ignored. */
  filePath: z.string().optional(),
  tls: z.boolean().optional(),
  connectTimeoutMs: z.number().int().optional(),
  commandTimeoutMs: z.number().int().optional(),
  busyTimeoutMs: z.number().int().optional(),
  /** When true, Testrix probes this connection on app startup. */
  connectOnBoot: z.boolean().default(false),
});

export type DatabaseConnection = z.infer<typeof databaseConnectionSchema>;

export const databaseSettingsSchema = z.object({
  connections: z.array(databaseConnectionSchema).default([]),
});

export type DatabaseSettings = z.infer<typeof databaseSettingsSchema>;

/** Default port for a database type when creating a new connection. */
export function defaultPortForDatabaseType(type: DatabaseType): number {
  switch (type) {
    case 'redis':
      return 6379;
    case 'postgresql':
      return 5432;
    case 'mysql':
      return 3306;
    case 'mssql':
      return 1433;
    case 'sqlite':
      return 0;
    default:
      return 5432;
  }
}

/** Creates a new empty connection profile with sensible defaults for the given type. */
export function createDefaultDatabaseConnection(
  type: DatabaseType = 'postgresql',
  id?: string,
): DatabaseConnection {
  return databaseConnectionSchema.parse({
    id: id ?? globalThis.crypto?.randomUUID?.() ?? `db-${Date.now()}`,
    name: 'New connection',
    type,
    host: 'localhost',
    port: defaultPortForDatabaseType(type),
  });
}

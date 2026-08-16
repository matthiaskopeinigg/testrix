import { z } from 'zod';

export const DATABASE_INTROSPECT_LEVELS = [
  'schemas',
  'tables',
  'columns',
  'indexes',
  'foreignKeys',
  'ddl',
] as const;

export const databaseIntrospectLevelSchema = z.enum(DATABASE_INTROSPECT_LEVELS);

export type DatabaseIntrospectLevel = z.infer<typeof databaseIntrospectLevelSchema>;

export const databaseCatalogSchemaItemSchema = z.object({
  name: z.string(),
  system: z.boolean().optional(),
});

export type DatabaseCatalogSchemaItem = z.infer<typeof databaseCatalogSchemaItemSchema>;

export const databaseCatalogTableKindSchema = z.enum(['table', 'view']);

export type DatabaseCatalogTableKind = z.infer<typeof databaseCatalogTableKindSchema>;

export const databaseCatalogTableSchema = z.object({
  schema: z.string(),
  name: z.string(),
  kind: databaseCatalogTableKindSchema,
});

export type DatabaseCatalogTable = z.infer<typeof databaseCatalogTableSchema>;

export const databaseCatalogColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  primaryKey: z.boolean(),
});

export type DatabaseCatalogColumn = z.infer<typeof databaseCatalogColumnSchema>;

export const databaseCatalogIndexSchema = z.object({
  name: z.string(),
  unique: z.boolean(),
  columns: z.array(z.string()),
});

export type DatabaseCatalogIndex = z.infer<typeof databaseCatalogIndexSchema>;

export const databaseCatalogForeignKeySchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  refSchema: z.string().optional(),
  refTable: z.string(),
  refColumns: z.array(z.string()),
});

export type DatabaseCatalogForeignKey = z.infer<typeof databaseCatalogForeignKeySchema>;

export const databaseIntrospectResultSchema = z.discriminatedUnion('level', [
  z.object({
    level: z.literal('schemas'),
    schemas: z.array(databaseCatalogSchemaItemSchema),
  }),
  z.object({
    level: z.literal('tables'),
    tables: z.array(databaseCatalogTableSchema),
  }),
  z.object({
    level: z.literal('columns'),
    columns: z.array(databaseCatalogColumnSchema),
  }),
  z.object({
    level: z.literal('indexes'),
    indexes: z.array(databaseCatalogIndexSchema),
  }),
  z.object({
    level: z.literal('foreignKeys'),
    foreignKeys: z.array(databaseCatalogForeignKeySchema),
  }),
  z.object({
    level: z.literal('ddl'),
    ddl: z.string(),
  }),
]);

export type DatabaseIntrospectResult = z.infer<typeof databaseIntrospectResultSchema>;

export const databaseQueryPageSchema = z.object({
  limit: z.number().int().positive().max(10_000),
  offset: z.number().int().nonnegative().max(10_000_000),
});

export type DatabaseQueryPage = z.infer<typeof databaseQueryPageSchema>;

export const databaseQueryEnvelopeSchema = z.object({
  rows: z.unknown(),
  columns: z.array(z.string()).optional(),
  affectedRows: z.number().int().nonnegative().optional(),
  columnTypes: z.array(z.string()).optional(),
  hasMore: z.boolean().optional(),
});

export type DatabaseQueryEnvelope = z.infer<typeof databaseQueryEnvelopeSchema>;

/** True when a query IPC payload is the structured envelope. */
export function isDatabaseQueryEnvelope(value: unknown): value is DatabaseQueryEnvelope {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'rows' in (value as Record<string, unknown>),
  );
}

import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { databaseConnectionSchema } from '../../../shared/config/database-settings.schema';
import { databaseConnectionStatusMapSchema } from '../../../shared/database/connection-status.schema';
import {
  canPageSqlSelect,
  databaseIntrospectLevelSchema,
  databaseQueryEnvelopeSchema,
  databaseQueryPageSchema,
  formatDatabaseConnectionError,
  parseSavedQueriesFile,
  savedQueriesFileSchema,
  wrapSqlExplain,
  wrapSqlSelectPage,
} from '../../../shared/database';
import { TestrixError, ErrorCodes } from '../../../shared/errors';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import { DbChannels } from '../channels/db.channels';
import { databaseQueryService } from '../../services/database/database-query.service';
import { databaseIntrospectService } from '../../services/database/database-introspect.service';
import { databaseConnectionStatusService } from '../../services/database/database-connection-status.service';
import { getMainSettings } from '../../services/settings-runtime';
import type { ConfigFileService } from '../../services/config/config-file.service';

const dbQueryPayloadSchema = z.object({
  connection: databaseConnectionSchema,
  query: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  page: databaseQueryPageSchema.optional(),
  paramNames: z.array(z.string().min(1)).optional(),
  paramValues: z.array(z.unknown()).optional(),
});

const dbIntrospectPayloadSchema = z.object({
  connection: databaseConnectionSchema,
  level: databaseIntrospectLevelSchema,
  schema: z.string().optional(),
  table: z.string().optional(),
});

export interface DbHandlerDeps {
  readonly files: ConfigFileService;
}

export function registerDbHandlers(ipc: IpcMainBinder, deps: DbHandlerDeps): void {
  databaseQueryService.startIdleDisconnectWatch(
    () => getMainSettings().databases.idleDisconnectMinutes,
  );
  ipc.handle(
    DbChannels.query,
    wrapInvokeHandler(DbChannels.query, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const parsed = dbQueryPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Invalid database query payload',
        );
      }
      const { connection, query, timeoutMs, page, paramNames, paramValues } = parsed.data;
      try {
        return await runPagedQuery(connection, query, timeoutMs, page, paramNames, paramValues);
      } catch (error: unknown) {
        throw new TestrixError(
          ErrorCodes.DATABASE_CONNECTION_FAILED,
          formatDatabaseConnectionError(error),
          { cause: error },
        );
      }
    }),
  );

  ipc.handle(
    DbChannels.explain,
    wrapInvokeHandler(DbChannels.explain, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const parsed = dbQueryPayloadSchema
        .pick({ connection: true, query: true, timeoutMs: true, paramNames: true, paramValues: true })
        .safeParse(raw);
      if (!parsed.success) {
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Invalid database explain payload',
        );
      }
      const explainSql = wrapSqlExplain(parsed.data.query, parsed.data.connection.type);
      if (!explainSql) {
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Explain is not available for this database type.',
        );
      }
      try {
        return await databaseQueryService.query(parsed.data.connection, explainSql, {
          stepTimeoutMs: parsed.data.timeoutMs,
          paramNames: parsed.data.paramNames,
          paramValues: parsed.data.paramValues,
        });
      } catch (error: unknown) {
        throw new TestrixError(
          ErrorCodes.DATABASE_CONNECTION_FAILED,
          formatDatabaseConnectionError(error),
          { cause: error },
        );
      }
    }),
  );

  ipc.handle(
    DbChannels.introspect,
    wrapInvokeHandler(DbChannels.introspect, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const parsed = dbIntrospectPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Invalid database introspect payload',
        );
      }
      try {
        return await databaseIntrospectService.introspect(parsed.data);
      } catch (error: unknown) {
        throw new TestrixError(
          ErrorCodes.DATABASE_CONNECTION_FAILED,
          formatDatabaseConnectionError(error),
          { cause: error },
        );
      }
    }),
  );

  ipc.handle(
    DbChannels.testConnection,
    wrapInvokeHandler(DbChannels.testConnection, async (_event: IpcMainInvokeEvent, raw: unknown) => {
      const parsed = databaseConnectionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TestrixError(
          ErrorCodes.CONFIG_VALIDATION_FAILED,
          'Invalid database connection payload',
        );
      }
      await databaseConnectionStatusService.testAndRecord(parsed.data);
      return { ok: true as const };
    }),
  );

  ipc.handle(
    DbChannels.getConnectionStatuses,
    wrapInvokeHandler(DbChannels.getConnectionStatuses, async () => {
      return databaseConnectionStatusMapSchema.parse(databaseConnectionStatusService.getStatusMap());
    }),
  );

  ipc.handle(
    DbChannels.getQueries,
    wrapInvokeHandler(DbChannels.getQueries, async () => deps.files.readSavedQueries()),
  );

  ipc.handle(
    DbChannels.setQueries,
    wrapInvokeHandler(DbChannels.setQueries, async (_event, raw: unknown) => {
      const parsed = savedQueriesFileSchema.safeParse(raw);
      if (!parsed.success) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid saved queries payload.');
      }
      return deps.files.saveSavedQueries(parseSavedQueriesFile(parsed.data));
    }),
  );
}

export async function closeDatabaseConnections(): Promise<void> {
  await databaseQueryService.closeAll();
}

async function runPagedQuery(
  connection: z.infer<typeof databaseConnectionSchema>,
  query: string,
  timeoutMs: number | undefined,
  page: z.infer<typeof databaseQueryPageSchema> | undefined,
  paramNames: readonly string[] | undefined,
  paramValues: readonly unknown[] | undefined,
): Promise<z.infer<typeof databaseQueryEnvelopeSchema>> {
  const canPage = Boolean(page && canPageSqlSelect(query, connection.type));
  const fetchLimit = page && canPage ? page.limit + 1 : page?.limit;
  const sql =
    page && canPage && fetchLimit
      ? wrapSqlSelectPage(query, fetchLimit, page.offset, connection.type)
      : query;
  const result = await databaseQueryService.query(connection, sql, {
    stepTimeoutMs: timeoutMs,
    paramNames,
    paramValues,
  });
  if (!page) {
    return result;
  }
  const rows = Array.isArray(result.rows) ? result.rows : null;
  if (!rows) {
    return { ...result, hasMore: false };
  }
  if (canPage) {
    const hasMore = rows.length > page.limit;
    return {
      ...result,
      rows: hasMore ? rows.slice(0, page.limit) : rows,
      hasMore,
    };
  }
  const start = page.offset;
  const end = start + page.limit;
  return {
    ...result,
    rows: rows.slice(start, end),
    hasMore: rows.length > end,
  };
}

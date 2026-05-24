import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { databaseConnectionSchema } from '../../../shared/config/database-settings.schema';
import { databaseConnectionStatusMapSchema } from '../../../shared/database/connection-status.schema';
import { formatDatabaseConnectionError } from '../../../shared/database/format-database-connection-error';
import { TestrixError, ErrorCodes } from '../../../shared/errors';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import { DbChannels } from '../channels/db.channels';
import { databaseQueryService } from '../../services/database/database-query.service';
import { databaseConnectionStatusService } from '../../services/database/database-connection-status.service';

const dbQueryPayloadSchema = z.object({
  connection: databaseConnectionSchema,
  query: z.string(),
  timeoutMs: z.number().int().positive().optional(),
});

export function registerDbHandlers(ipc: IpcMainBinder): void {
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
      const { connection, query, timeoutMs } = parsed.data;
      try {
        return await databaseQueryService.query(connection, query, { stepTimeoutMs: timeoutMs });
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
}

export async function closeDatabaseConnections(): Promise<void> {
  await databaseQueryService.closeAll();
}

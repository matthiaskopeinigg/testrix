import type { IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { databaseConnectionSchema } from '../../../shared/config/database-settings.schema';
import { TestrixError, ErrorCodes } from '../../../shared/errors';
import type { IpcMainBinder } from '../register-ipc';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import { DbChannels } from '../channels/db.channels';
import { databaseQueryService } from '../../services/database/database-query.service';

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
      return await databaseQueryService.query(connection, query, { stepTimeoutMs: timeoutMs });
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
      return await databaseQueryService.testConnection(parsed.data);
    }),
  );
}

export async function closeDatabaseConnections(): Promise<void> {
  await databaseQueryService.closeAll();
}

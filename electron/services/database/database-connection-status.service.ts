import type { DatabaseConnection } from '../../../shared/config/database-settings.schema';
import type { DatabaseConnectionStatusMap } from '../../../shared/database/connection-status.schema';
import { formatDatabaseConnectionError } from '../../../shared/database/format-database-connection-error';
import { ErrorCodes, TestrixError } from '../../../shared/errors';
import { logInfo } from '../../errors/logger';

import { databaseQueryService } from './database-query.service';

/**
 * Tracks last-known connectivity for configured database profiles.
 */
export class DatabaseConnectionStatusService {
  private readonly statuses = new Map<string, DatabaseConnectionStatusMap[string]>();

  getStatusMap(): DatabaseConnectionStatusMap {
    const out: DatabaseConnectionStatusMap = {};
    for (const [id, status] of this.statuses.entries()) {
      out[id] = status;
    }
    return out;
  }

  /**
   * Probes connections marked `connectOnBoot` (non-blocking for app boot).
   */
  warmConnectionsOnBoot(connections: readonly DatabaseConnection[]): void {
    const targets = connections.filter((c) => c.connectOnBoot);
    if (targets.length === 0) {
      return;
    }
    logInfo(`Probing ${targets.length} database connection(s) on boot`);
    void Promise.allSettled(targets.map((conn) => this.testAndRecord(conn)));
  }

  /**
   * Tests a connection and updates status; throws {@link TestrixError} on failure.
   */
  async testAndRecord(connection: DatabaseConnection): Promise<void> {
    this.setStatus(connection.id, { state: 'checking' });
    try {
      await databaseQueryService.testConnection(connection);
      this.setStatus(connection.id, {
        state: 'connected',
        checkedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const message = formatDatabaseConnectionError(error);
      this.setStatus(connection.id, {
        state: 'error',
        message,
        checkedAt: new Date().toISOString(),
      });
      throw new TestrixError(ErrorCodes.DATABASE_CONNECTION_FAILED, message, { cause: error });
    }
  }

  private setStatus(
    id: string,
    patch: Partial<DatabaseConnectionStatusMap[string]> & { state: DatabaseConnectionStatusMap[string]['state'] },
  ): void {
    const prev = this.statuses.get(id);
    this.statuses.set(id, {
      state: patch.state,
      message: patch.message ?? (patch.state === 'connected' ? undefined : prev?.message),
      checkedAt: patch.checkedAt ?? prev?.checkedAt,
    });
  }
}

export const databaseConnectionStatusService = new DatabaseConnectionStatusService();

/**
 * Probes database connections configured for startup.
 */
export function warmDatabaseConnectionsOnBoot(connections: readonly DatabaseConnection[]): void {
  databaseConnectionStatusService.warmConnectionsOnBoot(connections);
}

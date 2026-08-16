import type { DatabaseType } from '@shared/config';

import type { TxIconName } from '@app/shared/icons/tx-icon.registry';

const DATABASE_TYPE_ICONS = {
  postgresql: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mssql: 'mssql',
  oracle: 'oracle',
  sqlite: 'sqlite',
  cockroachdb: 'cockroachdb',
  clickhouse: 'clickhouse',
  mongodb: 'mongodb',
  redis: 'redis',
} as const satisfies Record<DatabaseType, TxIconName>;

/**
 * Sidebar / dropdown icon for a database engine.
 *
 * @param type Persisted `DatabaseConnection.type`.
 */
export function iconForDatabaseType(type: DatabaseType | string | undefined): TxIconName {
  if (type && type in DATABASE_TYPE_ICONS) {
    return DATABASE_TYPE_ICONS[type as DatabaseType];
  }
  return 'database';
}

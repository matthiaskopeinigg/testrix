import type { DatabaseConnection, DatabaseType } from '../config/database-settings.schema';

import { databaseEngineFamily } from './database-engine';
import type { DatabaseCatalogSchemaItem } from './database-introspect.schema';
import { isSystemSchemaName } from './sql-identifier';

/**
 * Resolves which catalog schemas should appear under a connection in the sidebar.
 *
 * DataGrip-style: only selected schemas are shown. When `selectedSchemas` is unset,
 * defaults to the current user / public / database schema instead of listing every
 * schema (Oracle can expose 200+ users via `all_users`).
 *
 * @param connection Connection profile (type, user, database, selectedSchemas).
 * @param schemas Full introspected schema list.
 * @param showSystemObjects When false, system schemas stay hidden even if selected.
 */
export function resolveVisibleDatabaseSchemas(
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database' | 'selectedSchemas'>,
  schemas: readonly DatabaseCatalogSchemaItem[],
  showSystemObjects: boolean,
): DatabaseCatalogSchemaItem[] {
  const eligible = schemas.filter((schema) => showSystemObjects || !schema.system);
  if (eligible.length === 0) {
    return [];
  }

  const selected = connection.selectedSchemas;
  if (selected !== undefined) {
    return filterSchemasBySelection(eligible, selected);
  }

  return filterSchemasBySelection(eligible, defaultSelectedSchemaNames(connection, eligible));
}

/**
 * Builds a lightweight schema list for the sidebar without querying every DB user.
 *
 * Opening a connection with hundreds of schemas (Oracle `all_users`) freezes the UI;
 * seed only the selected / default schemas and load the full directory when the
 * Schemas… picker opens.
 *
 * @param connection Connection profile.
 */
export function seedCatalogSchemaItems(
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database' | 'selectedSchemas'>,
): DatabaseCatalogSchemaItem[] {
  const names =
    connection.selectedSchemas !== undefined
      ? connection.selectedSchemas
      : guessedDefaultSchemaNames(connection);
  const seen = new Set<string>();
  const out: DatabaseCatalogSchemaItem[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const name = normalizeSeedSchemaName(connection.type, trimmed);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ name, system: isSystemSchemaName(name) });
  }
  return out;
}

/**
 * Default schema names when the connection has no explicit selection yet.
 *
 * @param connection Connection profile.
 * @param eligible Non-system (or all) schemas available from introspect.
 */
export function defaultSelectedSchemaNames(
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database'>,
  eligible: readonly DatabaseCatalogSchemaItem[],
): string[] {
  const byLower = new Map(eligible.map((schema) => [schema.name.toLowerCase(), schema.name]));
  const pick = (...candidates: readonly (string | undefined)[]): string[] => {
    for (const candidate of candidates) {
      const trimmed = candidate?.trim();
      if (!trimmed) {
        continue;
      }
      const hit = byLower.get(trimmed.toLowerCase());
      if (hit) {
        return [hit];
      }
    }
    return [];
  };

  const guessed = guessedDefaultSchemaNames(connection);
  const fromEligible = pick(...guessed);
  if (fromEligible.length > 0) {
    return fromEligible;
  }
  return firstEligible(eligible);
}

/**
 * Filters schemas whose names appear in `selected` (case-insensitive).
 *
 * @param schemas Candidate schemas.
 * @param selected Selected schema names.
 */
export function filterSchemasBySelection(
  schemas: readonly DatabaseCatalogSchemaItem[],
  selected: readonly string[],
): DatabaseCatalogSchemaItem[] {
  if (selected.length === 0) {
    return [];
  }
  const wanted = new Set(selected.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) {
    return [];
  }
  return schemas.filter((schema) => wanted.has(schema.name.toLowerCase()));
}

/**
 * True when the engine uses a schema list that can grow large (needs a picker).
 *
 * @param type Database engine type.
 */
export function databaseSupportsSchemaSelection(type: DatabaseType | null | undefined): boolean {
  const family = databaseEngineFamily(type);
  return (
    family === 'oracle' ||
    family === 'postgresql' ||
    family === 'mysql' ||
    family === 'mssql' ||
    family === 'clickhouse' ||
    family === 'mongodb'
  );
}

function guessedDefaultSchemaNames(
  connection: Pick<DatabaseConnection, 'type' | 'user' | 'database'>,
): string[] {
  const family = databaseEngineFamily(connection.type);
  switch (family) {
    case 'oracle':
      return connection.user?.trim() ? [connection.user.trim()] : [];
    case 'postgresql':
      return ['public'];
    case 'mysql':
      return connection.database?.trim() ? [connection.database.trim()] : [];
    case 'mssql':
      return connection.database?.trim() ? ['dbo', connection.database.trim()] : ['dbo'];
    case 'clickhouse':
    case 'mongodb':
      return connection.database?.trim() ? [connection.database.trim()] : [];
    default:
      return [];
  }
}

function normalizeSeedSchemaName(type: DatabaseType, name: string): string {
  if (databaseEngineFamily(type) === 'oracle') {
    return name.toUpperCase();
  }
  return name;
}

function firstEligible(eligible: readonly DatabaseCatalogSchemaItem[]): string[] {
  const first = eligible[0];
  return first ? [first.name] : [];
}

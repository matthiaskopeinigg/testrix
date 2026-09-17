import type {
  DatabaseCatalogColumn,
  DatabaseCatalogForeignKey,
  DatabaseCatalogIndex,
  DatabaseCatalogRoutine,
  DatabaseCatalogSequence,
  DatabaseCatalogTable,
  DatabaseCatalogTrigger,
  DatabaseCatalogUser,
  DatabaseConnection,
  DatabaseIntrospectLevel,
  DatabaseIntrospectResult,
  DatabaseQueryCell,
  DatabaseQueryTable,
} from '@testrix/contracts';
import { databaseEngineFamily, qualifySqlTableName, quoteSqlIdentifier } from '@testrix/contracts';

export async function introspectConnection(
  connection: DatabaseConnection,
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  table: string | undefined,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  const family = databaseEngineFamily(connection.type);
  if (family === 'redis')
    return introspectRedis(level, run);
  if (family === 'mongodb')
    return introspectMongo(level, schema, table, run);
  if (family === 'sqlite')
    return introspectSqlite(level, table, run);
  if (family === 'mysql')
    return introspectMysql(level, schema, table, connection.type, run);
  if (family === 'mssql')
    return introspectMssql(level, schema, table, run);
  if (family === 'oracle')
    return introspectOracle(level, schema, table, run);
  return introspectPostgres(level, schema, table, connection.type, run);
}

async function introspectPostgres(
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  table: string | undefined,
  type: DatabaseConnection['type'],
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  const schemaName = schema || 'public';
  if (level === 'schemas') {
    const result = await run(
      `SELECT nspname AS name FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1`,
    );
    return { schemas: result.rows.map((row) => String(row[0] ?? '')) };
  }
  if (level === 'tables') {
    const schemaSql = schema
      ? `AND table_schema = '${escapeSql(schema)}'`
      : '';
    const result = await run(
      `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_type IN ('BASE TABLE', 'VIEW') ${schemaSql} ORDER BY table_schema, table_name`,
    );
    return {
      tables: result.rows.map((row) => ({
        schema: String(row[0] ?? ''),
        name: String(row[1] ?? ''),
        kind: String(row[2] ?? '').includes('VIEW') ? 'view' : 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  if (level === 'columns' && table) {
    const result = await run(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = '${escapeSql(schemaName)}' AND table_name = '${escapeSql(table)}' ORDER BY ordinal_position`,
    );
    const pk = await run(
      `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey) JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE i.indisprimary AND n.nspname = '${escapeSql(schemaName)}' AND c.relname = '${escapeSql(table)}'`,
    );
    const pkNames = new Set(pk.rows.map((row) => String(row[0] ?? '')));
    return {
      columns: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        type: String(row[1] ?? ''),
        nullable: String(row[2] ?? '') === 'YES',
        primaryKey: pkNames.has(String(row[0] ?? '')),
      })) as DatabaseCatalogColumn[],
    };
  }
  if (level === 'indexes' && table) {
    const result = await run(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = '${escapeSql(schemaName)}' AND tablename = '${escapeSql(table)}'`,
    );
    return {
      indexes: result.rows.map((row) => parsePgIndex(String(row[0] ?? ''), String(row[1] ?? ''))),
    };
  }
  if (level === 'foreignKeys') {
    const tableSql = table ? `AND tc.table_name = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT tc.constraint_name, kcu.column_name, rel_kcu.table_schema AS referenced_table_schema, rel_kcu.table_name AS referenced_table_name, rel_kcu.column_name AS referenced_column_name, tc.table_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name JOIN information_schema.referential_constraints rc ON tc.constraint_schema = rc.constraint_schema AND tc.constraint_name = rc.constraint_name JOIN information_schema.key_column_usage rel_kcu ON rc.unique_constraint_schema = rel_kcu.constraint_schema AND rc.unique_constraint_name = rel_kcu.constraint_name AND kcu.position_in_unique_constraint = rel_kcu.ordinal_position WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = '${escapeSql(schemaName)}' ${tableSql} ORDER BY tc.constraint_name, kcu.ordinal_position`,
    );
    return { foreignKeys: mapForeignKeys(result.rows) };
  }
  if (level === 'ddl' && table) {
    return { ddl: `TABLE ${qualifySqlTableName(schemaName, table, type)}` };
  }
  if (level === 'routines') {
    const result = await run(
      `SELECT routine_name, routine_type, data_type FROM information_schema.routines WHERE routine_schema = '${escapeSql(schemaName)}' ORDER BY routine_name`,
    );
    return {
      routines: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        kind: routineKind(String(row[1] ?? '')),
        returnType: emptyToUndef(String(row[2] ?? '')),
      })) as DatabaseCatalogRoutine[],
    };
  }
  if (level === 'triggers') {
    const tableSql = table ? `AND event_object_table = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT trigger_name, event_object_table, action_timing, event_manipulation FROM information_schema.triggers WHERE trigger_schema = '${escapeSql(schemaName)}' ${tableSql} ORDER BY trigger_name`,
    );
    return { triggers: mapTriggers(result.rows) };
  }
  if (level === 'sequences') {
    const result = await run(
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = '${escapeSql(schemaName)}' ORDER BY sequence_name`,
    );
    return { sequences: mapNames(result.rows) as DatabaseCatalogSequence[] };
  }
  if (level === 'users') {
    const result = await run(
      `SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname`,
    );
    return {
      users: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        canLogin: isTruthyCell(row[1]),
      })) as DatabaseCatalogUser[],
    };
  }
  return {};
}

async function introspectMysql(
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  table: string | undefined,
  type: DatabaseConnection['type'],
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  const schemaPred = mysqlSchemaEquals(schema);
  if (level === 'schemas') {
    const result = await run(`SHOW DATABASES`);
    return { schemas: result.rows.map((row) => String(row[0] ?? '')) };
  }
  if (level === 'tables') {
    const db = schema ? ` FROM ${quoteSqlIdentifier(schema, type)}` : '';
    const result = await run(`SHOW FULL TABLES${db}`);
    return {
      tables: result.rows.map((row) => ({
        schema: schema || '',
        name: String(row[0] ?? ''),
        kind: String(row[1] ?? '').toLowerCase().includes('view') ? 'view' : 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  if (level === 'columns' && table) {
    const result = await run(`SHOW COLUMNS FROM ${qualifySqlTableName(schema || '', table, type)}`);
    return {
      columns: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        type: String(row[1] ?? ''),
        nullable: String(row[2] ?? '') === 'YES',
        primaryKey: String(row[3] ?? '') === 'PRI',
      })) as DatabaseCatalogColumn[],
    };
  }
  if (level === 'indexes' && table) {
    const result = await run(`SHOW INDEX FROM ${qualifySqlTableName(schema || '', table, type)}`);
    return {
      indexes: result.rows.map((row) => ({
        name: String(row[2] ?? row[0] ?? ''),
        columns: [String(row[4] ?? '')],
        unique: String(row[1] ?? '1') === '0',
        primary: String(row[2] ?? '') === 'PRIMARY',
      })) as DatabaseCatalogIndex[],
    };
  }
  if (level === 'foreignKeys') {
    const tableSql = table ? `AND TABLE_NAME = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = ${schemaPred} ${tableSql} ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    );
    return { foreignKeys: mapForeignKeys(result.rows) };
  }
  if (level === 'ddl' && table) {
    const result = await run(`SHOW CREATE TABLE ${qualifySqlTableName(schema || '', table, type)}`);
    return { ddl: String(result.rows[0]?.[1] ?? '') };
  }
  if (level === 'routines') {
    const result = await run(
      `SELECT ROUTINE_NAME, ROUTINE_TYPE, DATA_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ${schemaPred} ORDER BY ROUTINE_NAME`,
    );
    return {
      routines: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        kind: routineKind(String(row[1] ?? '')),
        returnType: emptyToUndef(String(row[2] ?? '')),
      })) as DatabaseCatalogRoutine[],
    };
  }
  if (level === 'triggers') {
    const tableSql = table ? `AND EVENT_OBJECT_TABLE = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ${schemaPred} ${tableSql} ORDER BY TRIGGER_NAME`,
    );
    return { triggers: mapTriggers(result.rows) };
  }
  if (level === 'users') {
    const result = await run(
      `SELECT User, Host FROM mysql.user WHERE User NOT IN ('mysql', 'sys', 'performance_schema', 'mysql.sys', 'mysql.session', 'mysql.infoschema') AND User NOT LIKE 'mysql.%' AND User <> '' ORDER BY User, Host`,
    );
    return {
      users: result.rows.map((row) => ({
        name: `${String(row[0] ?? '')}@${String(row[1] ?? '')}`,
        canLogin: true,
      })) as DatabaseCatalogUser[],
    };
  }
  return {};
}

async function introspectSqlite(
  level: DatabaseIntrospectLevel,
  table: string | undefined,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  if (level === 'schemas')
    return { schemas: ['main'] };
  if (level === 'tables') {
    const result = await run(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    return {
      tables: result.rows.map((row) => ({
        schema: 'main',
        name: String(row[0] ?? ''),
        kind: String(row[1] ?? '') === 'view' ? 'view' : 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  if (level === 'columns' && table) {
    const result = await run(`PRAGMA table_info(${quoteIdent(table)})`);
    return {
      columns: result.rows.map((row) => ({
        name: String(row[1] ?? ''),
        type: String(row[2] ?? ''),
        nullable: String(row[3] ?? '0') === '0',
        primaryKey: String(row[5] ?? '0') !== '0',
      })) as DatabaseCatalogColumn[],
    };
  }
  if (level === 'indexes' && table) {
    const result = await run(`PRAGMA index_list(${quoteIdent(table)})`);
    return {
      indexes: result.rows.map((row) => ({
        name: String(row[1] ?? ''),
        unique: String(row[2] ?? '0') === '1',
        primary: String(row[3] ?? '') === 'pk',
      })) as DatabaseCatalogIndex[],
    };
  }
  if (level === 'foreignKeys') {
    const names = table
      ? [table]
      : (await run(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        )).rows
          .map((row) => String(row[0] ?? ''))
          .filter(Boolean);
    const foreignKeys: DatabaseCatalogForeignKey[] = [];
    for (const name of names) {
      const result = await run(`PRAGMA foreign_key_list(${quoteIdent(name)})`);
      foreignKeys.push(...mapSqliteForeignKeys(name, result.rows, names.length > 1));
    }
    return { foreignKeys };
  }
  if (level === 'ddl' && table) {
    const result = await run(
      `SELECT sql FROM sqlite_master WHERE name = '${escapeSql(table)}' AND type IN ('table', 'view')`,
    );
    return { ddl: String(result.rows[0]?.[0] ?? '') };
  }
  if (level === 'triggers') {
    const tableSql = table ? `AND tbl_name = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' ${tableSql} ORDER BY name`,
    );
    return {
      triggers: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        table: emptyToUndef(String(row[1] ?? '')),
      })) as DatabaseCatalogTrigger[],
    };
  }
  return {};
}

async function introspectMssql(
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  table: string | undefined,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  const schemaName = schema || 'dbo';
  if (level === 'schemas') {
    const result = await run(`SELECT name FROM sys.schemas ORDER BY name`);
    return { schemas: result.rows.map((row) => String(row[0] ?? '')) };
  }
  if (level === 'tables') {
    const filter = schema ? `AND TABLE_SCHEMA = '${escapeSql(schema)}'` : '';
    const result = await run(
      `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE 1=1 ${filter}`,
    );
    return {
      tables: result.rows.map((row) => ({
        schema: String(row[0] ?? ''),
        name: String(row[1] ?? ''),
        kind: String(row[2] ?? '').includes('VIEW') ? 'view' : 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  if (level === 'columns' && table) {
    const result = await run(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '${escapeSql(schemaName)}' AND TABLE_NAME = '${escapeSql(table)}'`,
    );
    return {
      columns: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        type: String(row[1] ?? ''),
        nullable: String(row[2] ?? '') === 'YES',
      })) as DatabaseCatalogColumn[],
    };
  }
  if (level === 'indexes' && table) {
    const result = await run(
      `SELECT i.name, c.name, i.is_unique, i.is_primary_key FROM sys.indexes i INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id INNER JOIN sys.tables t ON i.object_id = t.object_id INNER JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = '${escapeSql(schemaName)}' AND t.name = '${escapeSql(table)}' AND i.name IS NOT NULL ORDER BY i.name, ic.key_ordinal`,
    );
    return { indexes: mapIndexes(result.rows) };
  }
  if (level === 'foreignKeys') {
    const tableSql = table ? `AND tab.name = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT fk.name, col.name, sch_ref.name, tab_ref.name, col_ref.name, tab.name FROM sys.foreign_keys fk INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id INNER JOIN sys.tables tab ON tab.object_id = fk.parent_object_id INNER JOIN sys.schemas sch ON sch.schema_id = tab.schema_id INNER JOIN sys.columns col ON col.object_id = tab.object_id AND col.column_id = fkc.parent_column_id INNER JOIN sys.tables tab_ref ON tab_ref.object_id = fk.referenced_object_id INNER JOIN sys.schemas sch_ref ON sch_ref.schema_id = tab_ref.schema_id INNER JOIN sys.columns col_ref ON col_ref.object_id = tab_ref.object_id AND col_ref.column_id = fkc.referenced_column_id WHERE sch.name = '${escapeSql(schemaName)}' ${tableSql} ORDER BY fk.name, fkc.constraint_column_id`,
    );
    return { foreignKeys: mapForeignKeys(result.rows) };
  }
  if (level === 'routines') {
    const result = await run(
      `SELECT o.name, o.type FROM sys.objects o INNER JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.type IN ('FN', 'IF', 'TF', 'FS', 'FT', 'P', 'PC') AND s.name = '${escapeSql(schemaName)}' ORDER BY o.name`,
    );
    return {
      routines: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        kind: routineKind(String(row[1] ?? '')),
      })) as DatabaseCatalogRoutine[],
    };
  }
  if (level === 'triggers') {
    const tableSql = table ? `AND OBJECT_NAME(tr.parent_id) = '${escapeSql(table)}'` : '';
    const result = await run(
      `SELECT tr.name, OBJECT_NAME(tr.parent_id), CASE WHEN tr.is_instead_of_trigger = 1 THEN 'INSTEAD OF' ELSE 'AFTER' END, te.type_desc FROM sys.triggers tr INNER JOIN sys.objects parent ON parent.object_id = tr.parent_id INNER JOIN sys.schemas s ON s.schema_id = parent.schema_id LEFT JOIN sys.trigger_events te ON te.object_id = tr.object_id WHERE tr.parent_class_desc = 'OBJECT_OR_COLUMN' AND s.name = '${escapeSql(schemaName)}' ${tableSql} ORDER BY tr.name`,
    );
    return { triggers: mapTriggers(result.rows) };
  }
  if (level === 'sequences') {
    const result = await run(
      `SELECT seq.name FROM sys.sequences seq INNER JOIN sys.schemas s ON s.schema_id = seq.schema_id WHERE s.name = '${escapeSql(schemaName)}' ORDER BY seq.name`,
    );
    return { sequences: mapNames(result.rows) as DatabaseCatalogSequence[] };
  }
  if (level === 'users') {
    const result = await run(
      `SELECT name FROM sys.database_principals WHERE type_desc IN ('SQL_USER', 'WINDOWS_USER') ORDER BY name`,
    );
    return {
      users: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        canLogin: true,
      })) as DatabaseCatalogUser[],
    };
  }
  return {};
}

async function introspectOracle(
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  table: string | undefined,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  const owner = (schema || '').toUpperCase();
  const tableName = table ? table.toUpperCase() : '';
  if (level === 'schemas') {
    const result = await run(`SELECT username FROM all_users ORDER BY username`);
    return { schemas: result.rows.map((row) => String(row[0] ?? '')) };
  }
  if (level === 'tables') {
    const ownerSql = schema ? `WHERE owner = '${escapeSql(owner)}'` : '';
    const result = await run(`SELECT owner, table_name FROM all_tables ${ownerSql}`);
    return {
      tables: result.rows.map((row) => ({
        schema: String(row[0] ?? ''),
        name: String(row[1] ?? ''),
        kind: 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  if (level === 'columns' && table) {
    const result = await run(
      `SELECT column_name, data_type, nullable FROM all_tab_columns WHERE owner = '${escapeSql(owner)}' AND table_name = '${escapeSql(tableName)}'`,
    );
    return {
      columns: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        type: String(row[1] ?? ''),
        nullable: String(row[2] ?? '') === 'Y',
      })) as DatabaseCatalogColumn[],
    };
  }
  if (level === 'indexes' && table) {
    const result = await run(
      `SELECT i.index_name, ic.column_name, CASE WHEN i.uniqueness = 'UNIQUE' THEN 1 ELSE 0 END, CASE WHEN c.constraint_type = 'P' THEN 1 ELSE 0 END FROM all_indexes i JOIN all_ind_columns ic ON i.owner = ic.index_owner AND i.index_name = ic.index_name LEFT JOIN all_constraints c ON c.owner = i.owner AND c.index_name = i.index_name AND c.constraint_type = 'P' WHERE i.owner = '${escapeSql(owner)}' AND i.table_name = '${escapeSql(tableName)}' ORDER BY i.index_name, ic.column_position`,
    );
    return { indexes: mapIndexes(result.rows) };
  }
  if (level === 'foreignKeys') {
    const ownerSql = schema ? `AND c.owner = '${escapeSql(owner)}'` : '';
    const tableSql = table ? `AND c.table_name = '${escapeSql(tableName)}'` : '';
    const result = await run(
      `SELECT c.constraint_name, col.column_name, pk.owner, pk.table_name, pk_col.column_name, c.table_name FROM all_constraints c JOIN all_cons_columns col ON col.owner = c.owner AND col.constraint_name = c.constraint_name JOIN all_constraints pk ON pk.owner = c.r_owner AND pk.constraint_name = c.r_constraint_name JOIN all_cons_columns pk_col ON pk_col.owner = pk.owner AND pk_col.constraint_name = pk.constraint_name AND pk_col.position = col.position WHERE c.constraint_type = 'R' ${ownerSql} ${tableSql} ORDER BY c.constraint_name, col.position`,
    );
    return { foreignKeys: mapForeignKeys(result.rows) };
  }
  if (level === 'routines') {
    const ownerSql = schema ? `AND owner = '${escapeSql(owner)}'` : '';
    const result = await run(
      `SELECT DISTINCT object_name, object_type FROM all_procedures WHERE object_type IN ('FUNCTION', 'PROCEDURE') ${ownerSql} ORDER BY object_name`,
    );
    return {
      routines: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        kind: routineKind(String(row[1] ?? '')),
      })) as DatabaseCatalogRoutine[],
    };
  }
  if (level === 'triggers') {
    const ownerSql = schema ? `AND owner = '${escapeSql(owner)}'` : '';
    const tableSql = table ? `AND table_name = '${escapeSql(tableName)}'` : '';
    const result = await run(
      `SELECT trigger_name, table_name, trigger_type, triggering_event FROM all_triggers WHERE 1=1 ${ownerSql} ${tableSql} ORDER BY trigger_name`,
    );
    return { triggers: mapTriggers(result.rows) };
  }
  if (level === 'sequences') {
    const ownerSql = schema ? `AND sequence_owner = '${escapeSql(owner)}'` : '';
    const result = await run(
      `SELECT sequence_name FROM all_sequences WHERE 1=1 ${ownerSql} ORDER BY sequence_name`,
    );
    return { sequences: mapNames(result.rows) as DatabaseCatalogSequence[] };
  }
  if (level === 'users') {
    const result = await run(`SELECT username FROM all_users ORDER BY username`);
    return {
      users: result.rows.map((row) => ({
        name: String(row[0] ?? ''),
        canLogin: true,
      })) as DatabaseCatalogUser[],
    };
  }
  return {};
}

async function introspectRedis(
  level: DatabaseIntrospectLevel,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  if (level === 'schemas')
    return { schemas: ['0'] };
  if (level === 'tables') {
    const result = await run('KEYS *');
    return {
      tables: result.rows.map((row) => ({
        schema: '0',
        name: String(row[0] ?? ''),
        kind: 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  return {};
}

async function introspectMongo(
  level: DatabaseIntrospectLevel,
  schema: string | undefined,
  _table: string | undefined,
  run: (sql: string) => Promise<DatabaseQueryTable>,
): Promise<DatabaseIntrospectResult> {
  if (level === 'schemas')
    return { schemas: [schema || 'test'] };
  if (level === 'tables') {
    const result = await run(JSON.stringify({ listCollections: 1 }));
    return {
      tables: result.rows.map((row) => ({
        schema: schema || 'test',
        name: String(row[0] ?? row[1] ?? ''),
        kind: 'table',
      })) as DatabaseCatalogTable[],
    };
  }
  return {};
}

function parsePgIndex(name: string, definition: string): DatabaseCatalogIndex {
  const upper = definition.toUpperCase();
  const primary = upper.includes('PRIMARY KEY') || /_pkey$/i.test(name);
  const unique = primary || /\bUNIQUE\b/.test(upper);
  const match = definition.match(/\(([^)]+)\)(?:\s+WHERE\b.*)?\s*$/i);
  const columns = match
    ? match[1]
        .split(',')
        .map((part) => part.trim().replace(/^"+|"+$/g, '').split(/\s+/)[0] ?? '')
        .filter(Boolean)
    : [];
  return { name, columns, unique, primary };
}

function mapForeignKeys(
  rows: readonly (readonly DatabaseQueryCell[])[],
): DatabaseCatalogForeignKey[] {
  const grouped = new Map<string, {
    name: string;
    table?: string;
    columns: string[];
    referencedSchema?: string;
    referencedTable?: string;
    referencedColumns: string[];
  }>();
  for (const row of rows) {
    const name = String(row[0] ?? '');
    const column = String(row[1] ?? '');
    const referencedSchema = emptyToUndef(String(row[2] ?? ''));
    const referencedTable = emptyToUndef(String(row[3] ?? ''));
    const referencedColumn = String(row[4] ?? '');
    const table = emptyToUndef(String(row[5] ?? ''));
    const key = `${table ?? ''}\0${name}\0${referencedSchema ?? ''}\0${referencedTable ?? ''}`;
    let fk = grouped.get(key);
    if (!fk) {
      fk = {
        name,
        table,
        columns: [],
        referencedSchema,
        referencedTable,
        referencedColumns: [],
      };
      grouped.set(key, fk);
    }
    if (column)
      fk.columns.push(column);
    if (referencedColumn)
      fk.referencedColumns.push(referencedColumn);
  }
  return [...grouped.values()];
}

function mapSqliteForeignKeys(
  tableName: string,
  rows: readonly (readonly DatabaseQueryCell[])[],
  qualifyName: boolean,
): DatabaseCatalogForeignKey[] {
  const grouped = new Map<string, {
    name: string;
    table: string;
    columns: string[];
    referencedSchema: string;
    referencedTable?: string;
    referencedColumns: string[];
  }>();
  for (const row of rows) {
    const id = String(row[0] ?? '');
    const key = `${tableName}:${id}`;
    let fk = grouped.get(key);
    if (!fk) {
      fk = {
        name: qualifyName ? key : id,
        table: tableName,
        columns: [],
        referencedSchema: 'main',
        referencedTable: emptyToUndef(String(row[2] ?? '')),
        referencedColumns: [],
      };
      grouped.set(key, fk);
    }
    const from = String(row[3] ?? '');
    const to = String(row[4] ?? '');
    if (from)
      fk.columns.push(from);
    if (to)
      fk.referencedColumns.push(to);
  }
  return [...grouped.values()];
}

function mapIndexes(
  rows: readonly (readonly DatabaseQueryCell[])[],
): DatabaseCatalogIndex[] {
  const grouped = new Map<string, { name: string; columns: string[]; unique: boolean; primary: boolean }>();
  for (const row of rows) {
    const name = String(row[0] ?? '');
    let index = grouped.get(name);
    if (!index) {
      index = {
        name,
        columns: [],
        unique: isTruthyCell(row[2]),
        primary: isTruthyCell(row[3]),
      };
      grouped.set(name, index);
    }
    const column = String(row[1] ?? '');
    if (column)
      index.columns.push(column);
  }
  return [...grouped.values()];
}

function mapTriggers(
  rows: readonly (readonly DatabaseQueryCell[])[],
): DatabaseCatalogTrigger[] {
  const grouped = new Map<string, DatabaseCatalogTrigger>();
  for (const row of rows) {
    const name = String(row[0] ?? '');
    const table = emptyToUndef(String(row[1] ?? ''));
    const timing = emptyToUndef(String(row[2] ?? ''));
    const event = emptyToUndef(String(row[3] ?? ''));
    const key = `${name}\0${table ?? ''}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { name, table, timing, event });
      continue;
    }
    if (event && existing.event && !existing.event.split(',').includes(event))
      grouped.set(key, { ...existing, event: `${existing.event},${event}` });
  }
  return [...grouped.values()];
}

function mapNames(rows: readonly (readonly DatabaseQueryCell[])[]): { name: string }[] {
  return rows.map((row) => ({ name: String(row[0] ?? '') })).filter((row) => row.name);
}

function routineKind(value: string): 'function' | 'procedure' {
  const upper = value.trim().toUpperCase();
  if (upper === 'P' || upper === 'PC' || upper.includes('PROC'))
    return 'procedure';
  return 'function';
}

function mysqlSchemaEquals(schema: string | undefined): string {
  if (schema)
    return `'${escapeSql(schema)}'`;
  return 'DATABASE()';
}

function isTruthyCell(value: DatabaseQueryCell | undefined): boolean {
  if (value === true || value === 1)
    return true;
  if (value === false || value === 0 || value == null)
    return false;
  const text = String(value).trim().toLowerCase();
  return text === 't' || text === 'true' || text === 'yes' || text === 'y' || text === '1';
}

function emptyToUndef(value: string): string | undefined {
  return value ? value : undefined;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

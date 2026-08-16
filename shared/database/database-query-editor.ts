import type { DatabaseType } from '../config/database-settings.schema';

export type DatabaseQueryEditorLanguage = 'sql' | 'redis' | 'js';

export type DatabaseQueryCompletionItem = {
  readonly label: string;
  readonly insert: string;
  readonly detail?: string;
  readonly caretOffsetFromEnd?: number;
};

/** Editor syntax mode for a saved database connection type. */
export function databaseQueryEditorLanguage(
  type: DatabaseType | null | undefined,
): DatabaseQueryEditorLanguage {
  if (type === 'redis') {
    return 'redis';
  }
  if (type === 'mongodb') {
    return 'js';
  }
  return 'sql';
}

/** Toolbar badge for the query editor. */
export function databaseQueryEditorLanguageLabel(type: DatabaseType | null | undefined): string {
  if (type === 'redis') {
    return 'Redis';
  }
  if (type === 'mssql') {
    return 'SQL Server';
  }
  if (type === 'mysql') {
    return 'MySQL';
  }
  if (type === 'mariadb') {
    return 'MariaDB';
  }
  if (type === 'sqlite') {
    return 'SQLite';
  }
  if (type === 'postgresql') {
    return 'PostgreSQL';
  }
  if (type === 'oracle') {
    return 'Oracle';
  }
  if (type === 'mongodb') {
    return 'MongoDB';
  }
  if (type === 'clickhouse') {
    return 'ClickHouse';
  }
  if (type === 'cockroachdb') {
    return 'CockroachDB';
  }
  return 'SQL';
}

/** Placeholder query for the selected connection type. */
export function databaseQueryEditorPlaceholder(type: DatabaseType | null | undefined): string {
  if (type === 'redis') {
    return 'SET testrix:demo:greeting "Hello from Testrix"';
  }
  if (type === 'mongodb') {
    return 'db.users.find({})';
  }
  return 'SELECT * FROM users WHERE id = {{userId}} AND email = :email';
}

const SQL_COMPLETIONS: readonly DatabaseQueryCompletionItem[] = [
  { label: 'SELECT', insert: 'SELECT ', detail: 'Read rows' },
  { label: 'FROM', insert: 'FROM ', detail: 'Table source' },
  { label: 'WHERE', insert: 'WHERE ', detail: 'Filter rows' },
  { label: 'INSERT INTO', insert: 'INSERT INTO ', detail: 'Insert row' },
  { label: 'UPDATE', insert: 'UPDATE ', detail: 'Update rows' },
  { label: 'DELETE FROM', insert: 'DELETE FROM ', detail: 'Delete rows' },
  { label: 'JOIN', insert: 'JOIN ', detail: 'Join tables' },
  { label: 'LEFT JOIN', insert: 'LEFT JOIN ', detail: 'Left join' },
  { label: 'ORDER BY', insert: 'ORDER BY ', detail: 'Sort' },
  { label: 'GROUP BY', insert: 'GROUP BY ', detail: 'Aggregate group' },
  { label: 'LIMIT', insert: 'LIMIT ', detail: 'Row limit' },
  { label: 'COUNT(*)', insert: 'COUNT(*)', detail: 'Aggregate count' },
  {
    label: 'SELECT * FROM …',
    insert: 'SELECT * FROM table_name WHERE id = {{userId}} AND email = :email',
    detail: 'Template query',
  },
  {
    label: 'INSERT …',
    insert: 'INSERT INTO table_name (column) VALUES ({{value}})',
    detail: 'Insert template',
  },
];

const REDIS_COMPLETIONS: readonly DatabaseQueryCompletionItem[] = [
  { label: 'GET', insert: 'GET ', detail: 'Read string value' },
  { label: 'SET', insert: 'SET ', detail: 'Write string value' },
  { label: 'DEL', insert: 'DEL ', detail: 'Delete key(s)' },
  { label: 'EXISTS', insert: 'EXISTS ', detail: 'Key exists' },
  { label: 'KEYS', insert: 'KEYS ', detail: 'Match keys' },
  { label: 'HGET', insert: 'HGET ', detail: 'Hash field read' },
  { label: 'HSET', insert: 'HSET ', detail: 'Hash field write' },
  { label: 'LPUSH', insert: 'LPUSH ', detail: 'List push left' },
  { label: 'RPUSH', insert: 'RPUSH ', detail: 'List push right' },
  { label: 'LRANGE', insert: 'LRANGE ', detail: 'List range' },
  { label: 'PING', insert: 'PING', detail: 'Health check' },
  {
    label: 'SET …',
    insert: 'SET testrix:demo:key "value"',
    detail: 'Set string template',
  },
  {
    label: 'GET …',
    insert: 'GET testrix:demo:key',
    detail: 'Get string template',
  },
];

const MONGO_COMPLETIONS: readonly DatabaseQueryCompletionItem[] = [
  { label: 'find', insert: 'db.collection.find({})', detail: 'Find documents' },
  { label: 'findOne', insert: 'db.collection.findOne({})', detail: 'Find one document' },
  { label: 'insertOne', insert: 'db.collection.insertOne({ "name": "Ada" })', detail: 'Insert document' },
  { label: 'updateOne', insert: 'db.collection.updateOne({ "_id": 1 }, { "$set": { "name": "Ada" } })', detail: 'Update one' },
  { label: 'deleteOne', insert: 'db.collection.deleteOne({ "_id": 1 })', detail: 'Delete one' },
  { label: 'aggregate', insert: 'db.collection.aggregate([{ "$match": {} }])', detail: 'Aggregation pipeline' },
  { label: 'countDocuments', insert: 'db.collection.countDocuments({})', detail: 'Count documents' },
  { label: 'show dbs', insert: 'show dbs', detail: 'List databases' },
  { label: 'show collections', insert: 'show collections', detail: 'List collections' },
];

/** Autocomplete rows for the query editor. */
export function databaseQueryEditorCompletions(
  type: DatabaseType | null | undefined,
): readonly DatabaseQueryCompletionItem[] {
  if (type === 'redis') {
    return REDIS_COMPLETIONS;
  }
  if (type === 'mongodb') {
    return MONGO_COMPLETIONS;
  }
  return SQL_COMPLETIONS;
}

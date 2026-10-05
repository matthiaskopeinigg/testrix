import {
  DATABASE_TYPE_IDS,
  buildTableDataSelectSql,
  createDefaultDatabaseConnection,
  createDefaultSavedQuery,
  databaseConnectionTabNodeId,
  databaseQueryTabNodeId,
  databaseSidebarFilterSchema,
  databaseSortModeSchema,
  databaseTableTabNodeId,
  parseDatabaseConnectionString,
  parseDatabaseConnectionTabNodeId,
  parseDatabasePrefs,
  parseDatabaseQueryTabNodeId,
  parseDatabasesFile,
  parseQueriesFile,
  refuseTableDml,
  resolveDatabaseExecuteQuery,
  shouldPromptDatabaseExecuteChooser,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { isDatabaseDraggableNav, type DatabaseNavNode } from './database-nav';
import {
  createConnectionItem,
  createQueryItem,
  insertConnectionNode,
  insertQueryNode,
  sortConnectionTree,
} from './database-tree';

describe('DatabaseSidebarComponent (rail)', () => {
  it('exposes sidebar filter and sort enums', () => {
    expect(databaseSidebarFilterSchema.options).toEqual(['all', 'folders', 'queries']);
    expect(databaseSortModeSchema.options).toEqual(['saved', 'name-asc', 'name-desc', 'date-new', 'date-old']);
    expect(DATABASE_TYPE_IDS).toEqual(
      expect.arrayContaining(['postgresql', 'mysql', 'sqlite', 'redis', 'mongodb']),
    );
  });

  it('round-trips connection and query tab node ids', () => {
    expect(parseDatabaseConnectionTabNodeId(databaseConnectionTabNodeId('c1'))).toBe('c1');
    expect(parseDatabaseQueryTabNodeId(databaseQueryTabNodeId('q1'))).toBe('q1');
    expect(databaseTableTabNodeId({ connectionId: 'c1', schema: 'public', table: 'users' })).toContain(
      'dbt:',
    );
  });

  it('only folders, connections, and queries are draggable in the nav', () => {
    const folder: DatabaseNavNode = { id: 'f1', kind: 'folder', name: 'Prod', section: 'connections' };
    const table: DatabaseNavNode = {
      id: 't1',
      kind: 'table',
      name: 'users',
      section: 'connections',
      connectionId: 'c1',
      schema: 'public',
      table: 'users',
    };
    expect(isDatabaseDraggableNav(folder)).toBe(true);
    expect(isDatabaseDraggableNav(table)).toBe(false);
  });
});

describe('DatabaseConnectionEditorComponent / query surfaces', () => {
  it('parses a postgres connection string into editor fields', () => {
    const parsed = parseDatabaseConnectionString('postgres://alice:s3cret@db.local:5432/shop');
    expect(parsed).toMatchObject({
      type: 'postgresql',
      host: 'db.local',
      port: 5432,
      user: 'alice',
      password: 's3cret',
      database: 'shop',
    });
  });

  it('creates default connection and query artifacts', () => {
    const connection = createDefaultDatabaseConnection('postgresql');
    expect(connection.type).toBe('postgresql');
    expect(connection.port).toBe(5432);
    const query = createDefaultSavedQuery('c1');
    expect(query.connectionId).toBe('c1');
    expect(query.query).toBe('');
  });

  it('resolves execute selection vs caret and prompts for multi-statement SQL', () => {
    const source = 'select 1;\nselect 2;';
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: 0,
        selectionEnd: 8,
        language: 'sql',
      }),
    ).toBe('select 1');
    expect(
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart: 0,
        selectionEnd: 0,
        language: 'sql',
      }),
    ).toBe(true);
  });
});

describe('Database tree helpers', () => {
  it('inserts folders ahead of connections and sorts by name', () => {
    const used = new Set<string>();
    const folder = createConnectionItem('folder', 'postgresql', used);
    used.add(folder.id);
    const leaf = createConnectionItem('connection', 'sqlite', used);
    const tree = insertConnectionNode(insertConnectionNode([], null, 0, [leaf]), null, 0, [folder]);
    const sorted = sortConnectionTree(tree, 'name-asc');
    expect(sorted.some((node) => node.kind === 'folder')).toBe(true);
    expect(sorted.some((node) => node.kind === 'connection')).toBe(true);
  });

  it('inserts a saved query under a folder', () => {
    const used = new Set<string>();
    const folder = createQueryItem('folder', '', used);
    used.add(folder.id);
    const query = createQueryItem('query', 'c1', used);
    const tree = insertQueryNode([folder], folder.id, 0, [query]);
    expect(tree[0]?.kind === 'folder' && tree[0].children).toHaveLength(1);
  });

  it('builds a table SELECT and refuses Redis DML', () => {
    expect(
      buildTableDataSelectSql({
        type: 'postgresql',
        schema: 'public',
        table: 'orders',
        filter: '',
        order: 'id',
      }),
    ).toMatch(/select \* from/i);
    expect(refuseTableDml({ type: 'redis', isView: false, pkColumns: ['id'] })).toBe('redis');
  });

  it('drops legacy engines when parsing databases.json', () => {
    const file = parseDatabasesFile({
      version: 1,
      connections: [
        {
          kind: 'connection',
          id: 'legacy',
          name: 'Old',
          type: 'clickhouse',
          host: 'localhost',
          port: 8123,
          connectOnBoot: false,
        },
        createDefaultDatabaseConnection('postgresql'),
      ],
    });
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]?.kind === 'connection' && file.nodes[0].type).toBe('postgresql');
    expect(parseQueriesFile({ version: 1, queries: [] }).nodes).toEqual([]);
    expect(parseDatabasePrefs({}).idleDisconnectMinutes).toBe(0);
  });
});

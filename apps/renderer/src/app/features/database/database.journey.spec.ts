import {
  buildTableDataSelectSql,
  createDefaultDatabaseConnection,
  createDefaultSavedQuery,
  parseDatabasesFile,
  parseQueriesFile,
  refuseTableDml,
  resolveDatabaseExecuteQuery,
  shouldPromptDatabaseExecuteChooser,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import {
  createConnectionItem,
  createQueryItem,
  insertConnectionNode,
  insertQueryNode,
} from './database-tree';

/**
 * End-to-end style journeys for Database without a browser driver.
 * Walks connection + query tree → execute resolution → table SELECT / DML gates.
 */
describe('Database e2e journeys', () => {
  it('creates a connection and saved query, then resolves a multi-statement run', () => {
    const used = new Set<string>();
    const connection = createConnectionItem('connection', 'postgresql', used);
    used.add(connection.id);
    const connections = insertConnectionNode([], null, 0, [connection]);
    const folder = createQueryItem('folder', '', used);
    used.add(folder.id);
    const source = 'select 1;\nselect 2;';
    const query = { ...createDefaultSavedQuery(connection.id), query: source };
    const queries = insertQueryNode([folder], folder.id, 0, [query]);

    const file = parseDatabasesFile({ version: 1, connections });
    const queryFile = parseQueriesFile({ version: 1, queries });
    expect(file.nodes).toHaveLength(1);
    expect(queryFile.nodes[0]?.kind === 'folder' && queryFile.nodes[0].children).toHaveLength(1);

    expect(
      shouldPromptDatabaseExecuteChooser({
        source,
        selectionStart: 0,
        selectionEnd: 0,
        language: 'sql',
      }),
    ).toBe(true);
    expect(
      resolveDatabaseExecuteQuery({
        source,
        selectionStart: 0,
        selectionEnd: 8,
        language: 'sql',
      }),
    ).toBe('select 1');
  });

  it('opens table data SQL for postgres and blocks Redis edits', () => {
    const connection = createDefaultDatabaseConnection('postgresql');
    expect(connection.host).toBe('localhost');
    expect(
      buildTableDataSelectSql({
        type: connection.type,
        schema: 'public',
        table: 'products',
        filter: 'price > 0',
        order: 'name',
      }),
    ).toMatch(/WHERE price > 0/i);
    expect(refuseTableDml({ type: 'redis', isView: false, pkColumns: ['id'] })).toBe('redis');
    expect(refuseTableDml({ type: 'postgresql', isView: true, pkColumns: ['id'] })).toBe('view');
  });
});

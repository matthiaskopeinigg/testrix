import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { DatabaseConnection } from '@testrix/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseHost } from './database-host.service';

function sqliteLoads(): boolean {
  try {
    const Database = createRequire(__filename)('better-sqlite3') as new (file: string) => { close(): void };
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
}

// better-sqlite3 may be rebuilt for Electron's ABI; then only the packaged app can load it.
const hasSqlite = sqliteLoads();

describe.skipIf(!hasSqlite)('DatabaseHost with SQLite', () => {
  let dir = '';
  let host: DatabaseHost;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-db-'));
    host = new DatabaseHost();
    connection = {
      id: 'conn-1',
      kind: 'connection',
      name: 'Local',
      type: 'sqlite',
      host: '',
      port: 0,
      filePath: path.join(dir, 'app.db'),
      connectOnBoot: false,
    };
    await host.query({ connection, query: 'create table items (id integer primary key, name text)' });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await host.closeAll();
    await rm(dir, { recursive: true, force: true });
  });

  async function count(): Promise<unknown> {
    const envelope = await host.query({ connection, query: 'select count(*) as n from items' });
    return envelope.table.rows[0]?.[0];
  }

  it('runs statements and reports the connection as connected', async () => {
    // Act
    await host.query({ connection, query: "insert into items (name) values ('a'), ('b')" });
    const result = await host.query({ connection, query: 'select name from items order by id' });

    // Assert
    expect(result.table.columns).toEqual(['name']);
    expect(result.table.rows).toEqual([['a'], ['b']]);
    expect(host.statusesSnapshot()['conn-1']?.state).toBe('connected');
  });

  it('records a failed query as an error status', async () => {
    // Act
    const run = host.query({ connection, query: 'select * from missing_table' });

    // Assert
    await expect(run).rejects.toThrow();
    expect(host.statusesSnapshot()['conn-1']?.state).toBe('error');
  });

  it('holds a session open until rollback discards its changes', async () => {
    // Arrange
    await host.sessionQuery({ tabId: 'tab-1', connection, query: "insert into items (name) values ('draft')" }, true);
    const pending = host.sessionState('tab-1');

    // Act
    await host.sessionRollback('tab-1', connection);

    // Assert
    expect(pending).toMatchObject({ open: true, uncommitted: true });
    expect(pending.rollbackAt).toBeTypeOf('number');
    expect(host.sessionState('tab-1').open).toBe(false);
    expect(await count()).toBe(0);
  });

  it('keeps changes after commit', async () => {
    // Arrange
    await host.sessionQuery({ tabId: 'tab-1', connection, query: "insert into items (name) values ('kept')" }, true);

    // Act
    await host.sessionCommit('tab-1', connection);

    // Assert
    expect(await count()).toBe(1);
    expect(host.sessionConnectionId('tab-1')).toBeNull();
  });

  it('rolls back an abandoned session after the configured timeout', async () => {
    // Arrange
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    host.configure({ idleMinutes: () => 0, rollbackSeconds: () => 5 });
    await host.sessionQuery({ tabId: 'tab-1', connection, query: "insert into items (name) values ('forgotten')" }, true);

    // Act
    await vi.advanceTimersByTimeAsync(5_001);

    // Assert
    expect(host.sessionState('tab-1').open).toBe(false);
    expect(await count()).toBe(0);
  });

  it('closes a pinned session on disconnect', async () => {
    // Arrange
    await host.sessionQuery({ tabId: 'tab-1', connection, query: "insert into items (name) values ('x')" }, true);

    // Act
    await host.disconnect('conn-1');

    // Assert
    expect(host.pinnedIds().size).toBe(0);
    expect(host.statusesSnapshot()['conn-1']?.state).toBe('unknown');
  });
});

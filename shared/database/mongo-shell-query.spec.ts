import { describe, expect, it } from 'vitest';

import { canPageMongoFind, parseMongoShellQuery, wrapMongoFindPage } from './mongo-shell-query';
import { resolveMongoConnectionUri } from './mongo-connection-uri';

describe('parseMongoShellQuery', () => {
  it('parses show dbs and JSON commands', () => {
    expect(parseMongoShellQuery('show dbs')).toEqual({ kind: 'listDatabases' });
    expect(parseMongoShellQuery('{ "ping": 1 }')).toMatchObject({
      kind: 'command',
      command: { ping: 1 },
    });
  });

  it('parses find with JSON filter, skip, and limit', () => {
    const parsed = parseMongoShellQuery('db.users.find({ "active": true }).skip(10).limit(5)', 'app');
    expect(parsed).toMatchObject({
      kind: 'find',
      collection: 'users',
      database: 'app',
      filter: { active: true },
      skip: 10,
      limit: 5,
    });
  });

  it('parses getSiblingDB getCollection find', () => {
    const parsed = parseMongoShellQuery(
      'db.getSiblingDB("shop").getCollection("orders").find({})',
    );
    expect(parsed).toMatchObject({
      kind: 'find',
      database: 'shop',
      collection: 'orders',
      filter: {},
    });
  });

  it('rejects unquoted Mongo shell keys', () => {
    expect(() => parseMongoShellQuery('db.users.find({ name: "Ada" })')).toThrow(/JSON/i);
  });
});

describe('wrapMongoFindPage', () => {
  it('appends skip and limit', () => {
    expect(canPageMongoFind('db.users.find({})')).toBe(true);
    expect(wrapMongoFindPage('db.users.find({});', 50, 100)).toBe(
      'db.users.find({}).skip(100).limit(50)',
    );
  });
});

describe('resolveMongoConnectionUri', () => {
  it('builds a standalone URI with auth and TLS', () => {
    expect(
      resolveMongoConnectionUri({
        host: 'localhost',
        port: 27017,
        user: 'ada',
        password: 's ecret',
        database: 'app',
        tls: true,
      }),
    ).toContain('mongodb://ada:s%20ecret@localhost:27017/app');
  });

  it('passes through mongodb+srv hosts', () => {
    expect(
      resolveMongoConnectionUri({ host: 'mongodb+srv://cluster.mongodb.net/app' }),
    ).toBe('mongodb+srv://cluster.mongodb.net/app');
  });
});

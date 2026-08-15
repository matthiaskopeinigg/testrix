import { describe, expect, it } from 'vitest';

import {
  databaseEngineFamily,
  databaseNameFieldLabel,
  isNonSqlDatabaseType,
  isSqlDatabaseType,
} from './database-engine';
import { defaultPortForDatabaseType } from '../config/database-settings.schema';

describe('databaseEngineFamily', () => {
  it('maps aliases onto wire-compatible families', () => {
    expect(databaseEngineFamily('mariadb')).toBe('mysql');
    expect(databaseEngineFamily('cockroachdb')).toBe('postgresql');
    expect(databaseEngineFamily('oracle')).toBe('oracle');
    expect(databaseEngineFamily('mongodb')).toBe('mongodb');
    expect(databaseEngineFamily('clickhouse')).toBe('clickhouse');
  });

  it('classifies SQL vs document/kv engines', () => {
    expect(isSqlDatabaseType('oracle')).toBe(true);
    expect(isSqlDatabaseType('clickhouse')).toBe(true);
    expect(isSqlDatabaseType('mariadb')).toBe(true);
    expect(isNonSqlDatabaseType('mongodb')).toBe(true);
    expect(isNonSqlDatabaseType('redis')).toBe(true);
    expect(isNonSqlDatabaseType('oracle')).toBe(false);
  });
});

describe('defaultPortForDatabaseType', () => {
  it('uses conventional ports for the new engines', () => {
    expect(defaultPortForDatabaseType('oracle')).toBe(1521);
    expect(defaultPortForDatabaseType('mongodb')).toBe(27017);
    expect(defaultPortForDatabaseType('clickhouse')).toBe(8123);
    expect(defaultPortForDatabaseType('cockroachdb')).toBe(26257);
    expect(defaultPortForDatabaseType('mariadb')).toBe(3306);
  });
});

describe('databaseNameFieldLabel', () => {
  it('labels Oracle service name separately from Redis index', () => {
    expect(databaseNameFieldLabel('oracle')).toBe('Service name / SID');
    expect(databaseNameFieldLabel('redis')).toBe('Database index');
    expect(databaseNameFieldLabel('postgresql')).toBe('Database name');
  });
});

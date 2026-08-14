import { describe, expect, it } from 'vitest';

import {
  databaseQueryEditorCompletions,
  databaseQueryEditorLanguage,
  databaseQueryEditorLanguageLabel,
  databaseQueryEditorPlaceholder,
} from './database-query-editor';

describe('databaseQueryEditorLanguage', () => {
  it('returns redis for redis connections', () => {
    expect(databaseQueryEditorLanguage('redis')).toBe('redis');
  });

  it('returns sql for relational connections', () => {
    expect(databaseQueryEditorLanguage('postgresql')).toBe('sql');
    expect(databaseQueryEditorLanguage('mysql')).toBe('sql');
    expect(databaseQueryEditorLanguage('sqlite')).toBe('sql');
    expect(databaseQueryEditorLanguage('mssql')).toBe('sql');
  });

  it('defaults to sql when type is unknown', () => {
    expect(databaseQueryEditorLanguage(null)).toBe('sql');
    expect(databaseQueryEditorLanguage(undefined)).toBe('sql');
  });
});

describe('databaseQueryEditorLanguageLabel', () => {
  it('returns connection-specific labels', () => {
    expect(databaseQueryEditorLanguageLabel('redis')).toBe('Redis');
    expect(databaseQueryEditorLanguageLabel('postgresql')).toBe('PostgreSQL');
    expect(databaseQueryEditorLanguageLabel('mysql')).toBe('MySQL');
  });
});

describe('databaseQueryEditorPlaceholder', () => {
  it('suggests redis SET example for redis', () => {
    expect(databaseQueryEditorPlaceholder('redis')).toContain('SET ');
  });

  it('suggests SQL SELECT for relational databases', () => {
    expect(databaseQueryEditorPlaceholder('postgresql')).toContain('SELECT');
  });
});

describe('databaseQueryEditorCompletions', () => {
  it('includes redis commands for redis', () => {
    const labels = databaseQueryEditorCompletions('redis').map((item) => item.label);
    expect(labels).toContain('GET');
    expect(labels).toContain('SET');
  });

  it('includes SQL keywords for postgresql', () => {
    const labels = databaseQueryEditorCompletions('postgresql').map((item) => item.label);
    expect(labels).toContain('SELECT');
    expect(labels).toContain('WHERE');
  });
});

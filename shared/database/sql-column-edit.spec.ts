import { describe, expect, it } from 'vitest';

import {
  classifySqlColumnType,
  isCompleteSqlColumnValue,
  isPartialSqlColumnValue,
  normalizeSqlBooleanValue,
  sqlColumnInputMode,
  sqlTypeBaseName,
} from './sql-column-edit';

describe('sqlTypeBaseName', () => {
  it('strips size arguments and qualifiers', () => {
    expect(sqlTypeBaseName('varchar(255)')).toBe('varchar');
    expect(sqlTypeBaseName('INT UNSIGNED')).toBe('int');
    expect(sqlTypeBaseName('Nullable(Int32)')).toBe('int32');
    expect(sqlTypeBaseName('')).toBe('');
  });
});

describe('classifySqlColumnType', () => {
  it('classifies common driver type names', () => {
    expect(classifySqlColumnType('bool')).toBe('boolean');
    expect(classifySqlColumnType('boolean')).toBe('boolean');
    expect(classifySqlColumnType('bit(1)')).toBe('boolean');
    expect(classifySqlColumnType('int4')).toBe('integer');
    expect(classifySqlColumnType('bigint')).toBe('integer');
    expect(classifySqlColumnType('tinyint')).toBe('integer');
    expect(classifySqlColumnType('numeric')).toBe('decimal');
    expect(classifySqlColumnType('float8')).toBe('decimal');
    expect(classifySqlColumnType('uuid')).toBe('uuid');
    expect(classifySqlColumnType('timestamptz')).toBe('datetime');
    expect(classifySqlColumnType('jsonb')).toBe('json');
    expect(classifySqlColumnType('text')).toBe('text');
    expect(classifySqlColumnType('varchar(255)')).toBe('text');
    expect(classifySqlColumnType('int32')).toBe('integer');
    expect(classifySqlColumnType('Nullable(Float64)')).toBe('decimal');
  });
});

describe('isPartialSqlColumnValue', () => {
  it('allows in-progress integers and rejects letters', () => {
    expect(isPartialSqlColumnValue('integer', '')).toBe(true);
    expect(isPartialSqlColumnValue('integer', '-')).toBe(true);
    expect(isPartialSqlColumnValue('integer', '-12')).toBe(true);
    expect(isPartialSqlColumnValue('integer', '12.3')).toBe(false);
    expect(isPartialSqlColumnValue('integer', '1a')).toBe(false);
  });

  it('allows one decimal point while typing numbers', () => {
    expect(isPartialSqlColumnValue('decimal', '12.')).toBe(true);
    expect(isPartialSqlColumnValue('decimal', '12.3')).toBe(true);
    expect(isPartialSqlColumnValue('decimal', '12.3.4')).toBe(false);
  });
});

describe('isCompleteSqlColumnValue', () => {
  it('requires a finished integer or decimal', () => {
    expect(isCompleteSqlColumnValue('integer', '')).toBe(true);
    expect(isCompleteSqlColumnValue('integer', '-')).toBe(false);
    expect(isCompleteSqlColumnValue('integer', '4')).toBe(true);
    expect(isCompleteSqlColumnValue('decimal', '.5')).toBe(true);
    expect(isCompleteSqlColumnValue('decimal', '5.')).toBe(true);
    expect(isCompleteSqlColumnValue('boolean', 'true')).toBe(true);
    expect(isCompleteSqlColumnValue('boolean', 'yes')).toBe(false);
    expect(isCompleteSqlColumnValue('json', '{"a":1}')).toBe(true);
    expect(isCompleteSqlColumnValue('json', '{')).toBe(false);
  });
});

describe('normalizeSqlBooleanValue', () => {
  it('maps driver boolean displays to true or false', () => {
    expect(normalizeSqlBooleanValue('t')).toBe('true');
    expect(normalizeSqlBooleanValue('FALSE')).toBe('false');
    expect(normalizeSqlBooleanValue(null)).toBeNull();
  });
});

describe('sqlColumnInputMode', () => {
  it('uses decimal inputmode for numeric kinds', () => {
    expect(sqlColumnInputMode('integer')).toBe('decimal');
    expect(sqlColumnInputMode('text')).toBeNull();
  });
});

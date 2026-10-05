import { describe, expect, it } from 'vitest';

import { parseCsvLine, parseScenarioTable } from './flow-data-table';

describe('parseCsvLine', () => {
  it('splits plain cells and trims them', () => {
    expect(parseCsvLine('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas and escaped quotes inside quoted cells', () => {
    expect(parseCsvLine('"one, two","say ""hi""",three')).toEqual(['one, two', 'say "hi"', 'three']);
  });
});

describe('parseScenarioTable', () => {
  it('reads a CSV header and rows', () => {
    const table = parseScenarioTable('email,password\nadmin@example.com,secret\nuser@example.com,pw');
    expect(table?.columns).toEqual(['email', 'password']);
    expect(table?.rows).toHaveLength(2);
    expect(table?.rows[0]).toEqual({ email: 'admin@example.com', password: 'secret' });
  });

  it('pads rows that are missing trailing cells', () => {
    const table = parseScenarioTable('a,b,c\n1,2');
    expect(table?.rows[0]).toEqual({ a: '1', b: '2', c: '' });
  });

  it('reads a JSON array of objects and unions the keys', () => {
    const table = parseScenarioTable('[{"user":"ada"},{"user":"bob","role":"admin"}]');
    expect([...(table?.columns ?? [])].sort()).toEqual(['role', 'user']);
    expect(table?.rows[1]).toEqual({ user: 'bob', role: 'admin' });
  });

  it('stringifies non-string JSON values', () => {
    const table = parseScenarioTable('[{"count":3,"ok":true}]');
    expect(table?.rows[0]).toEqual({ count: '3', ok: 'true' });
  });

  it('returns null for empty or unusable input', () => {
    expect(parseScenarioTable('   ')).toBeNull();
    expect(parseScenarioTable('[')).toBeNull();
    expect(parseScenarioTable('[]')).toBeNull();
  });
});

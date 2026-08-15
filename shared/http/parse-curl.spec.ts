import { describe, expect, it } from 'vitest';

import { looksLikeCurl, parseCurl } from './parse-curl';

describe('parseCurl', () => {
  it('parses a GET with headers', () => {
    const parsed = parseCurl(
      `curl 'https://api.example.com/users' \\\n  -H 'Authorization: Bearer secret' \\\n  -H 'Accept: application/json'`,
    );
    expect(parsed).toEqual({
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: [
        { key: 'Authorization', value: 'Bearer secret' },
        { key: 'Accept', value: 'application/json' },
      ],
      body: { mode: 'none' },
    });
  });

  it('parses POST JSON from --data-raw', () => {
    const parsed = parseCurl(
      `curl -X POST https://api.example.com/items -H 'Content-Type: application/json' --data-raw '{"name":"x"}'`,
    );
    expect(parsed?.method).toBe('POST');
    expect(parsed?.body).toEqual({ mode: 'json', raw: '{"name":"x"}' });
  });

  it('defaults to POST when data is present without -X', () => {
    const parsed = parseCurl(`curl https://api.example.com/items -d 'a=1'`);
    expect(parsed?.method).toBe('POST');
    expect(parsed?.body.mode).toBe('x-www-form-urlencoded');
    if (parsed?.body.mode === 'x-www-form-urlencoded') {
      expect(parsed.body.fields.map((row) => ({ key: row.key, value: row.value }))).toEqual([
        { key: 'a', value: '1' },
      ]);
    }
  });

  it('returns null for non-curl text', () => {
    expect(looksLikeCurl('https://example.com')).toBe(false);
    expect(parseCurl('https://example.com')).toBeNull();
  });
});

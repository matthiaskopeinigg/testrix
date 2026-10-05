import { describe, expect, it } from 'vitest';

import {
  extractFlowJsonPath,
  getJsonPathValue,
  parseFlowCaptureRules,
  serializeFlowCaptureRules,
} from './flow-json-path';

const REDIS_OTP = {
  replicas: [
    {
      replica: 'redis-0',
      entries: [
        { key: 'otp:user:123', otp: '482913', expiresIn: 240 },
        { key: 'otp:user:456', otp: '719284', expiresIn: 180 },
      ],
    },
    {
      replica: 'redis-1',
      entries: [
        { key: 'otp:user:789', otp: '381625', expiresIn: 120 },
        { key: 'otp:user:123', otp: '482913', expiresIn: 240 },
      ],
    },
  ],
};

describe('extractFlowJsonPath', () => {
  it('reads the first OTP with bracket paths', () => {
    expect(extractFlowJsonPath(JSON.stringify(REDIS_OTP), 'replicas[0].entries[0].otp')).toBe('482913');
  });

  it('reads the same field with dotted indexes', () => {
    expect(extractFlowJsonPath(JSON.stringify(REDIS_OTP), 'replicas.0.entries.0.otp')).toBe('482913');
  });

  it('stringifies objects', () => {
    const raw = extractFlowJsonPath(JSON.stringify(REDIS_OTP), 'replicas[0].entries[0]');
    expect(JSON.parse(raw)).toEqual(REDIS_OTP.replicas[0]!.entries[0]);
  });

  it('throws on invalid JSON', () => {
    expect(() => extractFlowJsonPath('{', 'a')).toThrow(/not valid JSON/);
  });

  it('throws on missing path', () => {
    expect(() => extractFlowJsonPath(JSON.stringify(REDIS_OTP), 'replicas[9].otp')).toThrow(/not found/);
  });

  it('throws on empty path', () => {
    expect(() => extractFlowJsonPath('{}', '  ')).toThrow(/empty/);
  });
});

describe('getJsonPathValue', () => {
  it('returns root for empty path', () => {
    expect(getJsonPathValue({ a: 1 }, '')).toEqual({ a: 1 });
  });
});

describe('parseFlowCaptureRules', () => {
  it('round-trips rules', () => {
    const rules = [
      { kind: 'json' as const, path: 'a.b', name: 'x' },
      { kind: 'header' as const, path: 'authorization', name: 'token' },
      { kind: 'body' as const, path: '', name: 'lastBody' },
    ];
    expect(parseFlowCaptureRules(serializeFlowCaptureRules(rules))).toEqual(rules);
  });

  it('falls back to default OTP rule on empty input', () => {
    const rules = parseFlowCaptureRules('');
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe('otp');
  });
});

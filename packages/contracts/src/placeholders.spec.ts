import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLACEHOLDER_EMAIL_DOMAIN,
  expandPlaceholderMap,
  expandPlaceholders,
  normalizeEmailDomain,
} from './placeholders';

describe('normalizeEmailDomain', () => {
  it('strips at-signs and falls back', () => {
    expect(normalizeEmailDomain(' @Test.AT ')).toBe('Test.AT');
    expect(normalizeEmailDomain('')).toBe(DEFAULT_PLACEHOLDER_EMAIL_DOMAIN);
  });
});

describe('expandPlaceholders', () => {
  const now = new Date('2026-09-17T15:21:00.000Z');
  const random = () => 0.42;
  const uuid = () => '11111111-2222-4333-8444-555555555555';

  it('expands uuid, timestamps, and date', () => {
    expect(expandPlaceholders('$uuid $timestamp $timestampMs $isoTimestamp $date', { now, uuid })).toBe(
      `11111111-2222-4333-8444-555555555555 ${Math.floor(now.getTime() / 1000)} ${now.getTime()} 2026-09-17T15:21:00.000Z 2026-09-17`,
    );
  });

  it('expands randomLong with a max digit length', () => {
    expect(expandPlaceholders('$randomLong(3)', { random })).toBe('420');
  });

  it('builds an email on the configured domain', () => {
    expect(expandPlaceholders('$randomEmail', { random, emailDomain: 'test.at' })).toBe('pppppppp@test.at');
    expect(expandPlaceholders('$randomEmail(other.at)', { random, emailDomain: 'test.at' })).toBe(
      'pppppppp@other.at',
    );
  });

  it('leaves unknown tokens alone', () => {
    expect(expandPlaceholders('price $foo and {{bar}}')).toBe('price $foo and {{bar}}');
  });

  it('expands values in a variable map once', () => {
    const next = expandPlaceholderMap({ id: '$uuid' }, { uuid });
    expect(next.id).toBe('11111111-2222-4333-8444-555555555555');
  });
});

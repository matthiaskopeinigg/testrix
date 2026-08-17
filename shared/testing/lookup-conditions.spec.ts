import { describe, expect, it } from 'vitest';

import {
  evaluateLookupWhen,
  lookupValueIsEmail,
  lookupValueIsUuid,
  lookupValueMatchesRegex,
} from './lookup-conditions';
import { LOOKUP_WHEN_EMAIL_REGEX, LOOKUP_WHEN_UUID_REGEX } from './lookups.schema';

describe('lookup-conditions', () => {
  it('detects email and uuid', () => {
    expect(lookupValueIsEmail('a@b.com')).toBe(true);
    expect(lookupValueIsEmail('not-an-email')).toBe(false);
    expect(lookupValueIsUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(lookupValueIsUuid('nope')).toBe(false);
  });

  it('reads input. and var. sources', () => {
    const values = {
      inputs: { email: 'a@b.com', uuid: '' },
      variables: { uuid: '550e8400-e29b-41d4-a716-446655440000' },
    };
    expect(evaluateLookupWhen({ kind: 'isEmail', source: 'input.email' }, values)).toBe(true);
    expect(evaluateLookupWhen({ kind: 'isEmail', source: 'input.uuid' }, values)).toBe(false);
    expect(evaluateLookupWhen({ kind: 'isUuid', source: 'var.uuid' }, values)).toBe(true);
    expect(evaluateLookupWhen(undefined, values)).toBe(true);
  });

  it('matches a regex against the source value', () => {
    const values = {
      inputs: { email: 'a@b.com', uuid: 'not-a-uuid' },
      variables: { uuid: '550e8400-e29b-41d4-a716-446655440000' },
    };
    expect(
      evaluateLookupWhen(
        { kind: 'matches', source: 'input.email', value: LOOKUP_WHEN_EMAIL_REGEX },
        values,
      ),
    ).toBe(true);
    expect(
      evaluateLookupWhen(
        { kind: 'matches', source: 'input.uuid', value: LOOKUP_WHEN_UUID_REGEX },
        values,
      ),
    ).toBe(false);
    expect(lookupValueMatchesRegex('a@b.com', LOOKUP_WHEN_EMAIL_REGEX)).toBe(true);
    expect(lookupValueMatchesRegex('x', '(')).toBe(false);
    expect(lookupValueMatchesRegex('anything', '')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  LOOKUP_WHEN_EMAIL_REGEX,
  LOOKUP_WHEN_IS_SET_REGEX,
  LOOKUP_WHEN_UUID_REGEX,
  createDefaultLookupsFile,
  createLookupDefinition,
  lookupStepSchema,
  lookupWhenSchema,
  parseLookupsFile,
} from './lookups.schema';

describe('lookups.schema', () => {
  it('parses an empty file', () => {
    expect(parseLookupsFile({})).toEqual(createDefaultLookupsFile());
  });

  it('creates a lookup with a default identifier input', () => {
    const lookup = createLookupDefinition('lk-1', 'Customer');
    expect(lookup.id).toBe('lk-1');
    expect(lookup.name).toBe('Customer');
    expect(lookup.inputs[0]?.key).toBe('identifier');
  });

  it('keeps required true on a step', () => {
    expect(lookupStepSchema.parse({ id: 'st-1', required: true }).required).toBe(true);
  });

  it('migrates legacy skip-unless kinds to regex matches', () => {
    expect(lookupWhenSchema.parse({ kind: 'isEmail', source: 'input.email' })).toEqual({
      kind: 'matches',
      source: 'input.email',
      value: LOOKUP_WHEN_EMAIL_REGEX,
    });
    expect(lookupWhenSchema.parse({ kind: 'isUuid', source: 'input.uuid' })).toEqual({
      kind: 'matches',
      source: 'input.uuid',
      value: LOOKUP_WHEN_UUID_REGEX,
    });
    expect(lookupWhenSchema.parse({ kind: 'isSet', source: 'var.uuid' })).toEqual({
      kind: 'matches',
      source: 'var.uuid',
      value: LOOKUP_WHEN_IS_SET_REGEX,
    });
    expect(lookupWhenSchema.parse({ kind: 'equals', source: 'input.flag', value: 'yes' })).toEqual({
      kind: 'matches',
      source: 'input.flag',
      value: '^yes$',
    });
  });
});

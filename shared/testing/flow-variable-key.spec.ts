import { describe, expect, it } from 'vitest';

import { normalizeFlowVariableKey, normalizeFlowVariableRecord } from './flow-variable-key';

describe('normalizeFlowVariableKey', () => {
  it('keeps a plain CACHE alias', () => {
    expect(normalizeFlowVariableKey('email')).toBe('email');
  });

  it('strips wrapping braces copied from the catalog', () => {
    expect(normalizeFlowVariableKey('{{email}}')).toBe('email');
    expect(normalizeFlowVariableKey('{{ profileUuid }}')).toBe('profileUuid');
  });

  it('strips wrapping quotes', () => {
    expect(normalizeFlowVariableKey('"email"')).toBe('email');
    expect(normalizeFlowVariableKey("'email'")).toBe('email');
  });
});

describe('normalizeFlowVariableRecord', () => {
  it('collapses braced keys onto the template lookup name', () => {
    expect(
      normalizeFlowVariableRecord({ '{{email}}': 'cached@example.com', profileUuid: 'uuid-1' }),
    ).toEqual({
      email: 'cached@example.com',
      profileUuid: 'uuid-1',
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  adjustBraceTemplateReplaceEnd,
  normalizeTemplateVariableInsert,
  shouldWrapTemplateInsertInJsonString,
} from './template-variable-insert';

describe('template-variable-insert', () => {
  it('wraps $ and {{}} inserts in JSON value positions', () => {
    const value = '{\n  "whatever": $';
    const start = value.lastIndexOf('$');
    const out = normalizeTemplateVariableInsert(value, start, value.length, '$uuid', { json: true });
    expect(out.insert).toBe('"$uuid"');
    expect(out.caretOffsetFromEnd).toBe(1);
  });

  it('wraps environment placeholders in JSON value positions', () => {
    const value = '{\n  "whatever": {{en';
    const open = value.lastIndexOf('{{');
    const out = normalizeTemplateVariableInsert(value, open, value.length, '{{env1}}', { json: true });
    expect(out.insert).toBe('"{{env1}}"');
  });

  it('does not add quotes when already inside a JSON string', () => {
    const value = '{\n  "whatever": "$';
    const start = value.lastIndexOf('$');
    const out = normalizeTemplateVariableInsert(value, start, value.length, '$uuid', { json: true });
    expect(out.insert).toBe('$uuid');
    expect(shouldWrapTemplateInsertInJsonString(value, start, value.length)).toBe(false);
  });

  it('dedupes brace insert when only {{ was typed', () => {
    const value = '{\n  "whatever": {{}}';
    const open = value.indexOf('{{');
    const end = adjustBraceTemplateReplaceEnd(value, open, open + 2, '');
    const out = normalizeTemplateVariableInsert(value, open, end, '{{env1}}', { json: true });
    expect(out.insert).toBe('"{{env1}}"');
    const next = value.slice(0, out.replaceStart) + out.insert + value.slice(out.replaceEnd);
    expect(next).toContain('"{{env1}}"');
    expect(next).not.toContain('{{{{');
  });
});

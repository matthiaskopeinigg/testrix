import { describe, expect, it } from 'vitest';

import { highlightCode } from './code-highlight';

describe('highlightCode', () => {
  it('returns plain text for text language', () => {
    expect(highlightCode('hello', 'text')).toEqual([{ kind: 'text', text: 'hello' }]);
  });

  it('colors json properties strings and numbers', () => {
    const tokens = highlightCode('{"a": "hi", "b": 1, "c": true}', 'json');
    const kinds = new Set(tokens.map((token) => token.kind));
    expect(kinds.has('property')).toBe(true);
    expect(kinds.has('string')).toBe(true);
    expect(kinds.has('number')).toBe(true);
    expect(kinds.has('keyword')).toBe(true);
    expect(tokens.map((token) => token.text).join('')).toBe('{"a": "hi", "b": 1, "c": true}');
  });

  it('colors xml tags and attributes', () => {
    const tokens = highlightCode('<root id="x"/>', 'xml');
    const kinds = new Set(tokens.map((token) => token.kind));
    expect(kinds.has('tag')).toBe(true);
    expect(kinds.has('attribute')).toBe(true);
    expect(kinds.has('string')).toBe(true);
    expect(tokens.map((token) => token.text).join('')).toBe('<root id="x"/>');
  });

  it('preserves source when language is unsupported text fallback', () => {
    expect(highlightCode('plain', 'text')[0]?.text).toBe('plain');
  });
});

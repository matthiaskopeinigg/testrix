import { describe, expect, it } from 'vitest';

import { transformBase64 } from './base64-codec';

describe('transformBase64', () => {
  it('round-trips UTF-8 text', () => {
    const encoded = transformBase64('hello 🌐', 'encode', false);
    expect(encoded.error).toBeNull();
    const decoded = transformBase64(encoded.value, 'decode', false);
    expect(decoded).toEqual({ value: 'hello 🌐', error: null });
  });

  it('uses URL-safe alphabet', () => {
    const encoded = transformBase64('\u00ff\u00ef', 'encode', true);
    expect(encoded.error).toBeNull();
    expect(encoded.value).not.toContain('+');
    expect(encoded.value).not.toContain('/');
    expect(transformBase64(encoded.value, 'decode', true).value.length).toBeGreaterThan(0);
  });

  it('returns an inline error for invalid decode input', () => {
    const result = transformBase64('%%%', 'decode', false);
    expect(result.value).toBe('');
    expect(result.error).toBeTruthy();
  });
});

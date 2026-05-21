import { describe, expect, it } from 'vitest';

import { transformBase64 } from './base64.logic';

describe('transformBase64', () => {
  it('encodes utf-8 text', () => {
    const result = transformBase64({ value: 'hi', encode: true, urlSafe: false });
    expect(result.error).toBeNull();
    expect(result.output).toBe('aGk=');
  });
});

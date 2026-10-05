import { describe, expect, it } from 'vitest';

import {
  generatePassword,
  PASSWORD_DEFAULT_LENGTH,
  passwordCharset,
  passwordEntropy,
} from './password-generator';

describe('password generator', () => {
  it('excludes look-alikes unless requested', () => {
    expect(passwordCharset({
      length: 24,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: false,
      lookalikes: false,
    })).not.toMatch(/[0O1lI]/);
  });

  it('generates from crypto and stays within length', () => {
    const secret = generatePassword({
      length: PASSWORD_DEFAULT_LENGTH,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      lookalikes: false,
    });
    expect(secret).toHaveLength(PASSWORD_DEFAULT_LENGTH);
    expect(secret).toMatch(/[a-z]/);
    expect(secret).toMatch(/[A-Z]/);
    expect(secret).toMatch(/[2-9]/);
  });

  it('reports entropy from charset size', () => {
    const entropy = passwordEntropy({
      length: 10,
      lowercase: true,
      uppercase: false,
      digits: false,
      symbols: false,
      lookalikes: true,
    });
    expect(entropy.charsetSize).toBe(26);
    expect(entropy.bits).toBeCloseTo(10 * Math.log2(26));
  });
});

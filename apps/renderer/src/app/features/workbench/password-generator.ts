export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_DEFAULT_LENGTH = 24;

export interface PasswordOptions {
  readonly length: number;
  readonly lowercase: boolean;
  readonly uppercase: boolean;
  readonly digits: boolean;
  readonly symbols: boolean;
  readonly lookalikes: boolean;
}

export interface PasswordEntropy {
  readonly bits: number;
  readonly label: string;
  readonly charsetSize: number;
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?';
const LOOKALIKES = new Set(['0', 'O', '1', 'l', 'I']);

/**
 * Build the character pool for a password generator.
 */
export function passwordCharset(options: PasswordOptions): string {
  let pool = '';
  if (options.lowercase)
    pool += LOWER;
  if (options.uppercase)
    pool += UPPER;
  if (options.digits)
    pool += DIGITS;
  if (options.symbols)
    pool += SYMBOLS;
  if (!options.lookalikes)
    pool = [...pool].filter((char) => !LOOKALIKES.has(char)).join('');
  return pool;
}

/**
 * Estimate Shannon entropy as length × log2(charset size).
 */
export function passwordEntropy(options: PasswordOptions): PasswordEntropy {
  const charsetSize = passwordCharset(options).length;
  const bits = charsetSize > 0 ? options.length * Math.log2(charsetSize) : 0;
  return { bits, charsetSize, label: entropyLabel(bits) };
}

/**
 * Generate a secret with `crypto.getRandomValues`. Never uses `Math.random`.
 */
export function generatePassword(options: PasswordOptions): string {
  const length = clampLength(options.length);
  const sets = selectedSets(options);
  const pool = passwordCharset({ ...options, length });
  if (!pool || sets.length === 0)
    return '';
  const chars: string[] = [];
  for (const set of sets)
    chars.push(pickChar(set));
  while (chars.length < length)
    chars.push(pickChar(pool));
  shuffle(chars);
  return chars.slice(0, length).join('');
}

function selectedSets(options: PasswordOptions): string[] {
  const sets: string[] = [];
  if (options.lowercase)
    sets.push(filterLookalikes(LOWER, options.lookalikes));
  if (options.uppercase)
    sets.push(filterLookalikes(UPPER, options.lookalikes));
  if (options.digits)
    sets.push(filterLookalikes(DIGITS, options.lookalikes));
  if (options.symbols)
    sets.push(filterLookalikes(SYMBOLS, options.lookalikes));
  return sets.filter((set) => set.length > 0);
}

function filterLookalikes(set: string, includeLookalikes: boolean): string {
  if (includeLookalikes)
    return set;
  return [...set].filter((char) => !LOOKALIKES.has(char)).join('');
}

function clampLength(length: number): number {
  if (!Number.isFinite(length))
    return PASSWORD_DEFAULT_LENGTH;
  return Math.min(PASSWORD_MAX_LENGTH, Math.max(PASSWORD_MIN_LENGTH, Math.round(length)));
}

function pickChar(pool: string): string {
  const index = randomIndex(pool.length);
  return pool.charAt(index);
}

function randomIndex(max: number): number {
  if (max <= 0)
    return 0;
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);
  let value = 256;
  while (value >= limit) {
    crypto.getRandomValues(bytes);
    value = bytes[0] ?? 0;
  }
  return value % max;
}

function shuffle(chars: string[]): void {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    const current = chars[index] ?? '';
    chars[index] = chars[swapWith] ?? current;
    chars[swapWith] = current;
  }
}

function entropyLabel(bits: number): string {
  if (bits < 40)
    return 'Weak';
  if (bits < 60)
    return 'Fair';
  if (bits < 80)
    return 'Strong';
  return 'Very strong';
}

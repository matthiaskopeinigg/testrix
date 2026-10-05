export const DEFAULT_PLACEHOLDER_EMAIL_DOMAIN = 'example.test';

export interface ExpandPlaceholderOptions {
  readonly now?: Date;
  readonly emailDomain?: string;
  readonly random?: () => number;
  readonly uuid?: () => string;
}

export interface PlaceholderCatalogItem {
  readonly insert: string;
  readonly label: string;
  readonly detail: string;
}

export const PLACEHOLDER_CATALOG: readonly PlaceholderCatalogItem[] = [
  { insert: '$uuid', label: '$uuid', detail: 'UUID v4' },
  { insert: '$guid', label: '$guid', detail: 'UUID v4' },
  { insert: '$timestamp', label: '$timestamp', detail: 'Unix seconds' },
  { insert: '$timestampMs', label: '$timestampMs', detail: 'Unix milliseconds' },
  { insert: '$isoTimestamp', label: '$isoTimestamp', detail: 'ISO-8601' },
  { insert: '$date', label: '$date', detail: 'UTC date YYYY-MM-DD' },
  { insert: '$randomLong(3)', label: '$randomLong(n)', detail: 'Random integer, at most n digits' },
  { insert: '$randomInt', label: '$randomInt', detail: 'Random 0–1000' },
  { insert: '$randomInt(1,100)', label: '$randomInt(min,max)', detail: 'Random integer in range' },
  { insert: '$randomHex(8)', label: '$randomHex(n)', detail: 'Random hex' },
  { insert: '$randomAlpha(8)', label: '$randomAlpha(n)', detail: 'Random letters' },
  { insert: '$randomAlphanumeric(8)', label: '$randomAlphanumeric(n)', detail: 'Random letters and digits' },
  { insert: '$randomEmail', label: '$randomEmail', detail: 'Random mailbox at the configured domain' },
  { insert: '$randomBoolean', label: '$randomBoolean', detail: 'true or false' },
];

const TOKEN = /\$([A-Za-z][A-Za-z0-9]*)(?:\(([^)]*)\))?/g;
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const ALNUM = `${ALPHA}0123456789`;
const HEX = '0123456789abcdef';

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function pick(source: string, random: () => number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1)
    out += source[Math.floor(random() * source.length)] ?? source[0];
  return out;
}

/** Strips @ and whitespace. Empty input falls back to example.test. */
export function normalizeEmailDomain(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^@+/, '').replace(/@+$/, '').replace(/\s+/g, '');
  return trimmed || DEFAULT_PLACEHOLDER_EMAIL_DOMAIN;
}

function parseArgs(raw: string | undefined): string[] {
  if (!raw)
    return [];
  return raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

function randomLong(n: number, random: () => number): string {
  const digits = clampInt(n, 1, 18);
  const max = 10 ** digits;
  const value = Math.floor(random() * max);
  return String(value);
}

function randomInt(min: number, max: number, random: () => number): string {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return String(lo + Math.floor(random() * (hi - lo + 1)));
}

function resolveToken(
  name: string,
  args: string[],
  options: Required<Pick<ExpandPlaceholderOptions, 'now' | 'random' | 'uuid'>> & { emailDomain: string },
): string | null {
  const key = name.toLowerCase();
  if (key === 'uuid' || key === 'guid')
    return options.uuid();
  if (key === 'timestamp')
    return String(Math.floor(options.now.getTime() / 1000));
  if (key === 'timestampms')
    return String(options.now.getTime());
  if (key === 'isotimestamp')
    return options.now.toISOString();
  if (key === 'date')
    return options.now.toISOString().slice(0, 10);
  if (key === 'randomlong')
    return randomLong(args[0] ? Number(args[0]) : 16, options.random);
  if (key === 'randomint') {
    if (args.length >= 2)
      return randomInt(Number(args[0]), Number(args[1]), options.random);
    return randomInt(0, 1000, options.random);
  }
  if (key === 'randomhex')
    return pick(HEX, options.random, clampInt(Number(args[0] ?? 8), 1, 64));
  if (key === 'randomalpha')
    return pick(ALPHA, options.random, clampInt(Number(args[0] ?? 8), 1, 64));
  if (key === 'randomalphanumeric')
    return pick(ALNUM, options.random, clampInt(Number(args[0] ?? 8), 1, 64));
  if (key === 'randomemail') {
    const domain = normalizeEmailDomain(args[0] || options.emailDomain);
    return `${pick(ALNUM, options.random, 8)}@${domain}`;
  }
  if (key === 'randomboolean')
    return options.random() < 0.5 ? 'false' : 'true';
  return null;
}

/**
 * Replaces known `$name` / `$name(args)` tokens. Unknown `$foo` stays as written.
 */
export function expandPlaceholders(text: string, options: ExpandPlaceholderOptions = {}): string {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
  const emailDomain = normalizeEmailDomain(options.emailDomain);
  return text.replace(TOKEN, (match, name: string, rawArgs: string | undefined) => {
    const next = resolveToken(name, parseArgs(rawArgs), { now, random, uuid, emailDomain });
    return next ?? match;
  });
}

export function expandPlaceholderMap(
  vars: Readonly<Record<string, string>>,
  options: ExpandPlaceholderOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars))
    out[key] = expandPlaceholders(value, options);
  return out;
}

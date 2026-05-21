/** Catalog entry for `$`-prefixed dynamic value suggestions. */
export interface DynamicVariableCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly insert: string;
  readonly detail: string;
  /** When true, prefer inserting with `()` and caret inside parentheses. */
  readonly hasArgs?: boolean;
}

/** Default `$` variables available across the app (headers, URLs, bodies, scripts, …). */
export const DYNAMIC_VARIABLES: readonly DynamicVariableCatalogItem[] = [
  {
    id: 'uuid',
    label: '$uuid',
    insert: '$uuid',
    detail: 'Random UUID v4',
  },
  {
    id: 'timestamp',
    label: '$timestamp',
    insert: '$timestamp',
    detail: 'Unix time in milliseconds',
  },
  {
    id: 'isoTimestamp',
    label: '$isoTimestamp',
    insert: '$isoTimestamp',
    detail: 'ISO-8601 timestamp',
  },
  {
    id: 'randomInt',
    label: '$randomInt',
    insert: '$randomInt()',
    detail: 'Random integer (digits in parentheses, default 6)',
    hasArgs: true,
  },
  {
    id: 'randomLong',
    label: '$randomLong',
    insert: '$randomLong',
    detail: 'Random long integer string',
  },
  {
    id: 'randomString',
    label: '$randomString',
    insert: '$randomString()',
    detail: 'Random alphanumeric string (length in parentheses, default 8)',
    hasArgs: true,
  },
] as const;

export interface DynamicVariableSuggestionContext {
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly prefix: string;
}

export interface DynamicVariableSuggestionsResult {
  readonly context: DynamicVariableSuggestionContext;
  readonly items: readonly DynamicVariableCatalogItem[];
}

export interface DynamicVariableResolveContext {
  readonly now?: Date;
  /** Returns a value in [0, 1). */
  readonly random?: () => number;
  readonly randomUuid?: () => string;
}

const TOKEN_PATTERN = /\$([a-zA-Z][a-zA-Z0-9]*)(?:\((\d*)\))?/g;

const RANDOM_INT_DEFAULT_DIGITS = 6;
const RANDOM_STRING_DEFAULT_LENGTH = 8;
const RANDOM_LONG_DIGITS = 15;
const MIN_DIGIT_COUNT = 1;
const MAX_DIGIT_COUNT = 18;

/**
 * Finds the active `$` token at the caret and returns matching catalog items.
 */
export function findDynamicVariableSuggestions(
  text: string,
  caretIndex: number,
  catalog: readonly DynamicVariableCatalogItem[] = DYNAMIC_VARIABLES,
): DynamicVariableSuggestionsResult | null {
  const caret = clampCaret(text, caretIndex);
  const active = findActiveToken(text, caret);
  if (!active) {
    return null;
  }

  const prefixLower = active.prefix.toLowerCase();
  const items = catalog.filter((item) => {
    const idLower = item.id.toLowerCase();
    const labelLower = item.label.toLowerCase();
    return (
      !prefixLower ||
      idLower.startsWith(prefixLower) ||
      labelLower.startsWith(`$${prefixLower}`) ||
      labelLower.includes(prefixLower)
    );
  });

  return {
    context: {
      replaceStart: active.start,
      replaceEnd: active.end,
      prefix: active.prefix,
    },
    items,
  };
}

/**
 * Replaces known `$variables` in a template string. Unknown tokens are left unchanged.
 */
export function resolveDynamicVariables(
  template: string,
  ctx: DynamicVariableResolveContext = {},
): string {
  const now = ctx.now ?? new Date();
  const random = ctx.random ?? Math.random;
  const randomUuid = ctx.randomUuid ?? defaultRandomUuid;

  return template.replace(TOKEN_PATTERN, (match, name: string, argRaw: string | undefined) => {
    switch (name) {
      case 'uuid':
        return randomUuid();
      case 'timestamp':
        return String(now.getTime());
      case 'isoTimestamp':
        return now.toISOString();
      case 'randomInt': {
        const digits = parseDigitArg(argRaw, RANDOM_INT_DEFAULT_DIGITS);
        return randomIntDigits(digits, random);
      }
      case 'randomLong':
        return randomLongDigits(random);
      case 'randomString': {
        const length = parseDigitArg(argRaw, RANDOM_STRING_DEFAULT_LENGTH);
        return randomAlphanumeric(length, random);
      }
      default:
        return match;
    }
  });
}

function findActiveToken(
  text: string,
  caret: number,
): { readonly start: number; readonly end: number; readonly prefix: string } | null {
  const before = text.slice(0, caret);
  const dollarIndex = before.lastIndexOf('$');
  if (dollarIndex < 0) {
    return null;
  }

  const segment = before.slice(dollarIndex + 1);
  if (!/^[\w(]*$/.test(segment)) {
    return null;
  }

  return {
    start: dollarIndex,
    end: caret,
    prefix: segment,
  };
}

function clampCaret(text: string, caretIndex: number): number {
  return Math.max(0, Math.min(caretIndex, text.length));
}

function parseDigitArg(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  if (raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampDigitCount(parsed);
}

function clampDigitCount(value: number): number {
  return Math.min(MAX_DIGIT_COUNT, Math.max(MIN_DIGIT_COUNT, Math.trunc(value)));
}

function randomIntDigits(digits: number, random: () => number): string {
  const max = 10 ** digits;
  const value = Math.floor(random() * max);
  return String(value).padStart(digits, '0');
}

function randomLongDigits(random: () => number): string {
  return randomIntDigits(RANDOM_LONG_DIGITS, random);
}

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomAlphanumeric(length: number, random: () => number): string {
  const count = clampDigitCount(length);
  let result = '';
  for (let index = 0; index < count; index += 1) {
    const charIndex = Math.floor(random() * ALPHANUMERIC.length);
    result += ALPHANUMERIC.charAt(charIndex);
  }
  return result;
}

function defaultRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-000000000000';
}

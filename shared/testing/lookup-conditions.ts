import {
  LOOKUP_WHEN_EMAIL_REGEX,
  LOOKUP_WHEN_UUID_REGEX,
  type LookupWhen,
  type LookupWhenKind,
} from './lookups.schema';

const EMAIL_PATTERN = new RegExp(LOOKUP_WHEN_EMAIL_REGEX);
const UUID_PATTERN = new RegExp(LOOKUP_WHEN_UUID_REGEX);

export interface LookupConditionValues {
  readonly inputs: Readonly<Record<string, string>>;
  readonly variables: Readonly<Record<string, string>>;
}

/**
 * Resolves a `when.source` token against form inputs then cached variables.
 * `input.email` reads the form; `var.uuid` reads cached variables.
 */
export function resolveLookupConditionValue(
  source: string,
  values: LookupConditionValues,
): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('input.')) {
    return String(values.inputs[trimmed.slice('input.'.length)] ?? '').trim();
  }
  if (trimmed.startsWith('var.')) {
    return String(values.variables[trimmed.slice('var.'.length)] ?? '').trim();
  }
  const fromInput = values.inputs[trimmed];
  if (fromInput !== undefined && String(fromInput).trim()) {
    return String(fromInput).trim();
  }
  return String(values.variables[trimmed] ?? '').trim();
}

/** True when `value` looks like an email address. */
export function lookupValueIsEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** True when `value` looks like a UUID. */
export function lookupValueIsUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/** Evaluates a skip-if condition. Missing `when` always passes. */
export function evaluateLookupWhen(
  when: LookupWhen | undefined,
  values: LookupConditionValues,
): boolean {
  if (!when) {
    return true;
  }
  const actual = resolveLookupConditionValue(when.source, values);
  return matchLookupWhenKind(when.kind, actual, when.value);
}

function matchLookupWhenKind(kind: LookupWhenKind, actual: string, expected?: string): boolean {
  switch (kind) {
    case 'matches':
      return lookupValueMatchesRegex(actual, expected);
    case 'isSet':
      return actual.length > 0;
    case 'isEmail':
      return lookupValueIsEmail(actual);
    case 'isUuid':
      return lookupValueIsUuid(actual);
    case 'equals':
      return actual === String(expected ?? '').trim();
    default:
      return true;
  }
}

/**
 * Tests `actual` against a JavaScript regex source. Empty pattern always matches.
 * Invalid patterns fail closed (skip the step).
 */
export function lookupValueMatchesRegex(actual: string, pattern: string | undefined): boolean {
  const raw = String(pattern ?? '').trim();
  if (!raw) {
    return true;
  }
  try {
    return new RegExp(raw).test(actual);
  } catch {
    return false;
  }
}

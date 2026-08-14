export interface RegexFlagSet {
  readonly g: boolean;
  readonly i: boolean;
  readonly m: boolean;
  readonly s: boolean;
  readonly u: boolean;
  readonly y: boolean;
}

export function flagsToString(flags: RegexFlagSet): string {
  let out = '';
  if (flags.g) out += 'g';
  if (flags.i) out += 'i';
  if (flags.m) out += 'm';
  if (flags.s) out += 's';
  if (flags.u) out += 'u';
  if (flags.y) out += 'y';
  return out;
}

export interface RegexMatchRow {
  readonly index: number;
  readonly text: string;
  readonly groups: readonly string[];
}

export interface RegexEvalResult {
  readonly matches: readonly RegexMatchRow[];
  readonly replacement: string;
  readonly error: string | null;
}

export function evaluateRegex(options: {
  readonly pattern: string;
  readonly flags: RegexFlagSet;
  readonly sample: string;
  readonly replacement: string;
}): RegexEvalResult {
  const source = options.pattern.trim();
  if (!source) {
    return { matches: [], replacement: options.sample, error: null };
  }
  try {
    const regex = new RegExp(source, flagsToString(options.flags));
    const text = options.sample;
    const found: RegexMatchRow[] = [];
    if (regex.global) {
      for (const match of text.matchAll(regex)) {
        found.push({
          index: match.index ?? 0,
          text: match[0],
          groups: match.slice(1).map((g) => g ?? ''),
        });
      }
    } else {
      const match = regex.exec(text);
      if (match) {
        found.push({
          index: match.index ?? 0,
          text: match[0],
          groups: match.slice(1).map((g) => g ?? ''),
        });
      }
    }
    const replacement = text.replace(regex, options.replacement);
    return { matches: found, replacement, error: null };
  } catch (err) {
    return {
      matches: [],
      replacement: options.sample,
      error: err instanceof Error ? err.message : 'Invalid regular expression.',
    };
  }
}

export const REGEX_CHEATSHEET: readonly { readonly id: string; readonly label: string; readonly pattern: string }[] = [
  { id: 'email', label: 'Email (simple)', pattern: '[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}' },
  { id: 'url', label: 'URL (simple)', pattern: 'https?:\\/\\/[^\\s]+' },
  { id: 'digits', label: 'Digits', pattern: '\\d+' },
  { id: 'uuid', label: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' },
];

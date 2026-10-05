export type RegexFlag = 'g' | 'i' | 'm' | 's' | 'u' | 'y';

export const REGEX_FLAGS: readonly RegexFlag[] = ['g', 'i', 'm', 's', 'u', 'y'];

export interface RegexMatch {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly groups: readonly string[];
}

export interface RegexSegment {
  readonly text: string;
  readonly isMatch: boolean;
}

export interface RegexTestResult {
  readonly error: string | null;
  readonly matches: readonly RegexMatch[];
  readonly segments: readonly RegexSegment[];
}

const MATCH_CAP = 200;

/**
 * Test `pattern` against `haystack` with native `RegExp`.
 */
export function testRegex(
  pattern: string,
  flags: readonly RegexFlag[],
  haystack: string,
): RegexTestResult {
  if (!pattern)
    return { error: null, matches: [], segments: haystack ? [{ text: haystack, isMatch: false }] : [] };
  let expression: RegExp;
  try {
    expression = new RegExp(pattern, uniqueFlags(flags).join(''));
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid regular expression',
      matches: [],
      segments: haystack ? [{ text: haystack, isMatch: false }] : [],
    };
  }
  const matches: RegexMatch[] = [];
  if (expression.global || expression.sticky) {
    expression.lastIndex = 0;
    let exec = expression.exec(haystack);
    let guard = 0;
    while (exec && matches.length < MATCH_CAP && guard < haystack.length + 2) {
      guard += 1;
      const start = exec.index;
      const text = exec[0] ?? '';
      const end = start + text.length;
      matches.push({
        index: matches.length,
        start,
        end,
        text,
        groups: exec.slice(1),
      });
      if (text.length === 0)
        expression.lastIndex = start + 1;
      exec = expression.exec(haystack);
    }
  } else {
    const exec = expression.exec(haystack);
    if (exec) {
      const start = exec.index;
      const text = exec[0] ?? '';
      matches.push({
        index: 0,
        start,
        end: start + text.length,
        text,
        groups: exec.slice(1),
      });
    }
  }
  return { error: null, matches, segments: segmentsFromMatches(haystack, matches) };
}

function uniqueFlags(flags: readonly RegexFlag[]): RegexFlag[] {
  return REGEX_FLAGS.filter((flag) => flags.includes(flag));
}

function segmentsFromMatches(haystack: string, matches: readonly RegexMatch[]): RegexSegment[] {
  if (!haystack)
    return [];
  const segments: RegexSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor)
      segments.push({ text: haystack.slice(cursor, match.start), isMatch: false });
    if (match.end > match.start)
      segments.push({ text: haystack.slice(match.start, match.end), isMatch: true });
    cursor = Math.max(cursor, match.end);
  }
  if (cursor < haystack.length)
    segments.push({ text: haystack.slice(cursor), isMatch: false });
  return segments;
}

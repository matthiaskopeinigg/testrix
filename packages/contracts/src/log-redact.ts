export const LOG_SECRET_REDACTED = '[redacted]';

export const LOG_SECRET_MIN_LENGTH = 4;

export const LOG_RECENT_LINE_LIMIT = 200;

/**
 * Replaces known secret values and common token prefixes in a log line.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let next = redactKnownPatterns(text);
  const unique = [...new Set(secrets)]
    .filter((value) => value.length >= LOG_SECRET_MIN_LENGTH)
    .sort((left, right) => right.length - left.length);
  for (const secret of unique) {
    next = replaceAllLiteral(next, secret, LOG_SECRET_REDACTED);
    const jsonEscaped = JSON.stringify(secret).slice(1, -1);
    if (jsonEscaped !== secret)
      next = replaceAllLiteral(next, jsonEscaped, LOG_SECRET_REDACTED);
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret)
      next = replaceAllLiteral(next, encoded, LOG_SECRET_REDACTED);
  }
  return next;
}

function redactKnownPatterns(text: string): string {
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+=/]+/gi, `$1${LOG_SECRET_REDACTED}`)
    .replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, `$1${LOG_SECRET_REDACTED}`);
}

function replaceAllLiteral(haystack: string, needle: string, replacement: string): string {
  if (!needle)
    return haystack;
  return haystack.split(needle).join(replacement);
}

/**
 * Copies text to the clipboard; returns whether the operation succeeded.
 */
export async function copyDevToolText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encodes a UTF-8 string as standard Base64.
 */
export function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Decodes standard Base64 into a UTF-8 string.
 */
export function decodeBase64Utf8(value: string): string {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decodes a Base64url segment used in JWT parts.
 */
export function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return decodeBase64Utf8(padded + '='.repeat(padLen));
}

/**
 * Encodes a string as Base64url without padding.
 */
export function encodeBase64Url(value: string): string {
  return encodeBase64Utf8(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Builds a human-readable summary for a five-field cron expression.
 */
export function describeCronExpression(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) {
    return 'Cron expressions need five fields: minute hour day month weekday.';
  }

  const [minute, hour, day, month, weekday] = parts;
  return `Minute ${minute}, hour ${hour}, day-of-month ${day}, month ${month}, weekday ${weekday}`;
}

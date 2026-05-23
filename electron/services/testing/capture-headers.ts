/**
 * Converts Electron webRequest header records to key/value pairs.
 */
export function headersRecordToPairs(
  headers: Record<string, string | string[]> | undefined,
): readonly { readonly key: string; readonly value: string }[] {
  if (!headers) {
    return [];
  }
  return Object.entries(headers).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join('\n') : String(value ?? ''),
  }));
}

const SENSITIVE_HEADER_NAMES = new Set(['authorization', 'cookie', 'set-cookie']);

/**
 * Redacts sensitive request/response header values for the capture log.
 */
export function redactCaptureHeaders(
  headersObj: Record<string, string | string[]> | undefined,
): readonly { readonly key: string; readonly value: string }[] {
  if (!headersObj) {
    return [];
  }
  return Object.entries(headersObj).map(([key, value]) => {
    const raw = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
      return { key, value: '[redacted]' };
    }
    return { key, value: raw };
  });
}

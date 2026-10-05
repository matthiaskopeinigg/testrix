const HOST_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ERR_NAME_NOT_RESOLVED']);

/**
 * True when fetch failed because the hostname did not resolve.
 */
export function isUnresolvedHostnameError(error: unknown): boolean {
  const bits = collectErrorBits(error);
  if (bits.codes.some((code) => HOST_CODES.has(code)))
    return true;
  const haystack = bits.messages.join(' ').toLowerCase();
  return haystack.includes('enotfound') || haystack.includes('getaddrinfo') || haystack.includes('name not resolved');
}

function collectErrorBits(
  error: unknown,
  bits: { codes: string[]; messages: string[] } = { codes: [], messages: [] },
  seen = new Set<unknown>(),
): { codes: string[]; messages: string[] } {
  if (!error || seen.has(error))
    return bits;
  seen.add(error);
  if (typeof error === 'string') {
    bits.messages.push(error);
    return bits;
  }
  if (typeof error !== 'object')
    return bits;
  if ('code' in error && typeof error.code === 'string' && error.code)
    bits.codes.push(error.code);
  if (error instanceof Error && error.message)
    bits.messages.push(error.message);
  if ('cause' in error)
    collectErrorBits(error.cause, bits, seen);
  return bits;
}

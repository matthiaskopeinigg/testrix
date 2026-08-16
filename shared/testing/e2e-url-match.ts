/**
 * Resolves the URL pattern for Assert URL / Wait for URL.
 * The Test Suite editor stores the expected URL in `value`.
 */
export function resolveE2eUrlExpectation(selector: string, value: string): string {
  const fromValue = value.trim();
  if (fromValue.length > 0) {
    return fromValue;
  }
  return selector.trim();
}

/**
 * Loose page URL compare: strips scheme, optional `www.`, query/hash, trailing slashes.
 */
export function normalizePageUrlForE2e(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return '';
  }
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    const pathPart = parsed.pathname.replace(/\/+$/, '');
    return `${host}${pathPart}`;
  } catch {
    let url = trimmed.toLowerCase();
    url = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    url = url.replace(/^www\./i, '');
    url = url.split(/[?#]/, 1)[0] ?? url;
    return url.replace(/\/+$/, '');
  }
}

/**
 * True when the live page URL matches the expected pattern (substring or normalized host+path).
 */
export function e2eUrlMatchesExpectation(currentUrl: string, expected: string): boolean {
  const expectedRaw = expected.trim();
  if (!expectedRaw) {
    return false;
  }
  const current = String(currentUrl || '');
  if (current.includes(expectedRaw)) {
    return true;
  }
  const expectedNorm = normalizePageUrlForE2e(expectedRaw);
  const currentNorm = normalizePageUrlForE2e(current);
  if (!expectedNorm) {
    return false;
  }
  return currentNorm.includes(expectedNorm);
}

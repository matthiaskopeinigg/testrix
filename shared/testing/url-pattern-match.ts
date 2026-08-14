/**
 * Matches a request URL against an interceptor / flow listener pattern.
 *
 * - `*` or `**` alone → any URL
 * - ends with `**` → prefix (substring before `**` must appear in the URL)
 * - ends with `*` → prefix (substring before `*` must appear)
 * - otherwise → substring contains (legacy)
 */
export function urlPatternMatches(url: string, rawPattern: string): boolean {
  const clean = String(rawPattern ?? '')
    .toLowerCase()
    .trim()
    .replace(/^\/+/, '');
  const u = String(url ?? '').toLowerCase();
  if (!clean) {
    return false;
  }
  if (clean === '*' || clean === '**') {
    return !!u;
  }
  if (clean.endsWith('**') && clean.length > 2) {
    const prefix = clean.slice(0, -2);
    return prefix ? u.includes(prefix) : !!u;
  }
  if (clean.endsWith('*') && clean.length > 1) {
    const prefix = clean.slice(0, -1);
    return prefix ? u.includes(prefix) : !!u;
  }
  return u.includes(clean);
}

/** Short display label for a redirect Location URL (host + path). */
export function formatRedirectTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

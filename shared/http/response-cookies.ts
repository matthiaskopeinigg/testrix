import type { HttpResponseHeader } from './outgoing-request.schema';

export interface ParsedSetCookie {
  readonly name: string;
  readonly value: string;
  readonly raw: string;
}

/** Parses Set-Cookie header values from a response header list (v1). */
export function parseSetCookieHeaders(
  headers: readonly HttpResponseHeader[],
): readonly ParsedSetCookie[] {
  const out: ParsedSetCookie[] = [];
  for (const h of headers) {
    if (h.key.toLowerCase() !== 'set-cookie') {
      continue;
    }
    const raw = h.value ?? '';
    const semi = raw.indexOf(';');
    const pair = semi >= 0 ? raw.slice(0, semi) : raw;
    const eq = pair.indexOf('=');
    const name = eq >= 0 ? pair.slice(0, eq).trim() : pair.trim();
    const value = eq >= 0 ? pair.slice(eq + 1).trim() : '';
    out.push({ name, value, raw });
  }
  return out;
}

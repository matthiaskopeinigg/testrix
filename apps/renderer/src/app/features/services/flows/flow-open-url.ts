import { browserOpenUrlCandidates, ensureRequestUrlScheme, interpolateFlow } from '@testrix/contracts';

/**
 * Interpolates env vars and adds http(s):// when the open URL has no scheme.
 */
export function resolveFlowBrowserOpenUrl(
  raw: string,
  vars: Readonly<Record<string, string>>,
): string {
  const interpolated = interpolateFlow(raw.trim(), vars).trim();
  if (!interpolated)
    return '';
  return ensureRequestUrlScheme(interpolated);
}

/**
 * Candidate URLs to try when loading a browser-open page (base, then www.).
 */
export function flowBrowserOpenUrlCandidates(resolved: string): readonly string[] {
  return browserOpenUrlCandidates(resolved);
}

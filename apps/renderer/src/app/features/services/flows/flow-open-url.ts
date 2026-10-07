import {
  browserOpenUrlCandidates,
  ensureRequestUrlScheme,
  resolveFlowText,
  type ExpandPlaceholderOptions,
} from '@testrix/contracts';

/**
 * True when a saved field still holds `{{name}}` or a `$token` and must not be
 * overwritten with the value used to load a page.
 */
export function flowFieldKeepsTemplate(value: string): boolean {
  return value.includes('{{') || /\$[A-Za-z]/.test(value);
}

/**
 * Interpolates env vars and placeholders, then adds http(s):// when the open URL has no scheme.
 */
export function resolveFlowBrowserOpenUrl(
  raw: string,
  vars: Readonly<Record<string, string>>,
  options: ExpandPlaceholderOptions = {},
): string {
  const interpolated = resolveFlowText(raw.trim(), vars, options).trim();
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

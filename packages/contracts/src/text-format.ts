/**
 * Escapes text for safe interpolation into generated HTML reports.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lowercase, dash-separated file name stem. Returns `fallback` when nothing usable is left.
 */
export function fileSlug(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

/**
 * Compact run duration: `850ms`, `2.4s`, `1.5m`.
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000)
    return `${Math.round(ms)}ms`;
  if (ms < 60_000)
    return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/** Clock-style duration for live runs: `20s`, `1m 20s`. */
export function formatClockDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60)
    return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

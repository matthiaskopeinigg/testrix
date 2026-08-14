/** Minimal flow identity for E2E screenshot subfolders. */
export interface E2eFlowScreenshotContext {
  readonly id: string;
  readonly name: string;
}

const FS_SAFE_NAME_RE = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Builds a single folder segment under the global screenshot root from the flow title.
 */
export function sanitizeFlowScreenshotSubfolder(flow: E2eFlowScreenshotContext): string {
  const raw = (flow.name || '').trim();
  let base = raw.replace(FS_SAFE_NAME_RE, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!base) {
    const idPart = (flow.id || 'unknown')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
    base = idPart ? `flow-${idPart}` : 'flow';
  }
  return base;
}

/** Joins path segments for main-process `path.normalize`. */
export function joinE2ePathSegments(...parts: string[]): string {
  const raw = parts.filter((part) => part != null && String(part).trim() !== '').map((part) => String(part).trim());
  if (raw.length === 0) {
    return '';
  }
  const first = raw[0].replace(/[/\\]+$/g, '');
  const rest = raw
    .slice(1)
    .map((part) => part.replace(/^[/\\]+/g, '').replace(/[/\\]+$/g, ''))
    .filter(Boolean);
  return [first, ...rest].join('/');
}

/**
 * When settings define a base folder, screenshots go under `{base}/{flow folder}/`.
 * Returns `null` when the setting is empty.
 */
export function resolveGlobalE2eScreenshotDirectory(
  e2eScreenshotFolder: string | undefined,
  flow: E2eFlowScreenshotContext,
): string | null {
  const base = e2eScreenshotFolder?.trim();
  if (!base) {
    return null;
  }
  return joinE2ePathSegments(base, sanitizeFlowScreenshotSubfolder(flow));
}

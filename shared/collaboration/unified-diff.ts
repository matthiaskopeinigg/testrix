export type UnifiedDiffLineKind = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

export interface UnifiedDiffLine {
  readonly kind: UnifiedDiffLineKind;
  readonly text: string;
}

export interface UnifiedDiffFile {
  readonly path: string;
  readonly diff: string;
}

/**
 * Parses a unified diff into display lines with add/remove/context styling.
 */
export function parseUnifiedDiffLines(diff: string): readonly UnifiedDiffLine[] {
  if (!diff.trim()) {
    return [];
  }

  const lines: UnifiedDiffLine[] = [];
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      lines.push({ kind: 'hunk', text: raw });
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff --git')) {
      lines.push({ kind: 'meta', text: raw });
      continue;
    }
    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith('-')) {
      lines.push({ kind: 'remove', text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith(' ')) {
      lines.push({ kind: 'context', text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith('\\')) {
      lines.push({ kind: 'meta', text: raw });
      continue;
    }
    if (raw.length > 0) {
      lines.push({ kind: 'meta', text: raw });
    }
  }
  return lines;
}

/**
 * Splits a multi-file unified diff into per-file chunks keyed by the post-change path.
 */
export function splitUnifiedDiffByFile(raw: string): readonly UnifiedDiffFile[] {
  if (!raw.trim()) {
    return [];
  }

  const chunks = raw.split(/^diff --git /m).filter((part) => part.trim().length > 0);
  const files: UnifiedDiffFile[] = [];

  for (const chunk of chunks) {
    const body = `diff --git ${chunk}`;
    const path = extractDiffFilePath(body);
    if (!path) {
      continue;
    }
    files.push({ path, diff: body });
  }

  return files;
}

function extractDiffFilePath(diff: string): string | null {
  const header = diff.split('\n')[0] ?? '';
  const match = header.match(/\sb\/(.+)$/);
  if (match?.[1]) {
    return match[1];
  }

  const oldPath = diff.match(/^--- a\/(.+)$/m)?.[1];
  const newPath = diff.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  return newPath ?? oldPath ?? null;
}

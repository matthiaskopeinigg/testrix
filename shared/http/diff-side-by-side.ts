import type { LineDiffHunk } from './response-diff';

export const DIFF_MAX_PAIRED_LINES = 640;

export type DiffSideLineKind = 'remove' | 'add' | 'unchanged' | 'empty';

export interface DiffSideLine {
  readonly lineNo: number | null;
  readonly text: string;
  readonly kind: DiffSideLineKind;
}

export interface DiffPairedRow {
  readonly left: DiffSideLine;
  readonly right: DiffSideLine;
}

export type DiffPairedDisplayRow =
  | { readonly kind: 'pair'; readonly pair: DiffPairedRow }
  | { readonly kind: 'ellipsis'; readonly skipped: number };

/**
 * Aligns line hunks into side-by-side rows (previous left, current right).
 */
export function buildPairedDiffRows(hunks: readonly LineDiffHunk[]): readonly DiffPairedRow[] {
  const pairs: DiffPairedRow[] = [];
  let leftNo = 0;
  let rightNo = 0;

  for (const hunk of hunks) {
    if (hunk.kind === 'remove') {
      leftNo++;
      pairs.push({
        left: { lineNo: leftNo, text: hunk.line, kind: 'remove' },
        right: { lineNo: null, text: '', kind: 'empty' },
      });
    } else if (hunk.kind === 'add') {
      rightNo++;
      pairs.push({
        left: { lineNo: null, text: '', kind: 'empty' },
        right: { lineNo: rightNo, text: hunk.line, kind: 'add' },
      });
    } else {
      leftNo++;
      rightNo++;
      pairs.push({
        left: { lineNo: leftNo, text: hunk.line, kind: 'unchanged' },
        right: { lineNo: rightNo, text: hunk.line, kind: 'unchanged' },
      });
    }
  }

  return pairs;
}

const CONTEXT_PAIRS = 3;

export interface BuildDiffDisplayOptions {
  /** When false, show every line until the max cap (API Workbench style). */
  readonly collapseUnchanged?: boolean;
}

/** Optionally collapse long unchanged runs, then cap total paired rows for the viewer. */
export function buildDiffDisplayRows(
  hunks: readonly LineDiffHunk[],
  maxLines = DIFF_MAX_PAIRED_LINES,
  options: BuildDiffDisplayOptions = {},
): {
  readonly rows: readonly DiffPairedDisplayRow[];
  readonly truncated: boolean;
  readonly leftLineCount: number;
  readonly rightLineCount: number;
} {
  const pairs = buildPairedDiffRows(hunks);
  const collapsed: DiffPairedDisplayRow[] = [];
  let leftLineCount = 0;
  let rightLineCount = 0;
  const collapseUnchanged = options.collapseUnchanged ?? false;

  if (!collapseUnchanged) {
    for (const pair of pairs) {
      collapsed.push({ kind: 'pair', pair });
      if (pair.left.lineNo !== null) {
        leftLineCount++;
      }
      if (pair.right.lineNo !== null) {
        rightLineCount++;
      }
    }
    const truncated = collapsed.length > maxLines;
    return {
      rows: truncated ? collapsed.slice(0, maxLines) : collapsed,
      truncated,
      leftLineCount,
      rightLineCount,
    };
  }

  let i = 0;
  while (i < pairs.length) {
    const bothUnchanged =
      pairs[i]!.left.kind === 'unchanged' && pairs[i]!.right.kind === 'unchanged';
    if (!bothUnchanged) {
      collapsed.push({ kind: 'pair', pair: pairs[i]! });
      if (pairs[i]!.left.lineNo !== null) {
        leftLineCount++;
      }
      if (pairs[i]!.right.lineNo !== null) {
        rightLineCount++;
      }
      i++;
      continue;
    }

    let j = i;
    while (
      j < pairs.length &&
      pairs[j]!.left.kind === 'unchanged' &&
      pairs[j]!.right.kind === 'unchanged'
    ) {
      j++;
    }
    const runLen = j - i;
    if (runLen > CONTEXT_PAIRS * 2) {
      for (let k = 0; k < CONTEXT_PAIRS; k++) {
        collapsed.push({ kind: 'pair', pair: pairs[i + k]! });
        leftLineCount++;
        rightLineCount++;
      }
      collapsed.push({ kind: 'ellipsis', skipped: runLen - CONTEXT_PAIRS * 2 });
      for (let k = runLen - CONTEXT_PAIRS; k < runLen; k++) {
        collapsed.push({ kind: 'pair', pair: pairs[i + k]! });
        leftLineCount++;
        rightLineCount++;
      }
    } else {
      for (let k = i; k < j; k++) {
        collapsed.push({ kind: 'pair', pair: pairs[k]! });
        leftLineCount++;
        rightLineCount++;
      }
    }
    i = j;
  }

  const truncated = collapsed.length > maxLines;
  const rows = truncated ? collapsed.slice(0, maxLines) : collapsed;

  return { rows, truncated, leftLineCount, rightLineCount };
}

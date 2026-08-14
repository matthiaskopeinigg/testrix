import type { TxCodeEditorLanguage } from './tx-code-editor-language';

/** A foldable block spanning at least two lines (opener line through closer line). */
export interface TxCodeEditorFoldRegion {
  readonly id: string;
  /** 0-based line index of the line containing the opening delimiter. */
  readonly startLine: number;
  /** 0-based line index of the line containing the matching closing delimiter. */
  readonly endLine: number;
}

/** Placeholder text shown on a folded block's interior line in the display buffer. */
export const TX_CODE_EDITOR_FOLD_PLACEHOLDER = '...';

const FOLD_PLACEHOLDER = TX_CODE_EDITOR_FOLD_PLACEHOLDER;

const BRACE_LANGUAGES = new Set<TxCodeEditorLanguage>(['json', 'js', 'ts', 'css', 'scss', 'graphql']);

/**
 * Finds multiline `{`/`[`/`(` blocks suitable for gutter folding.
 */
export function findTxCodeEditorFoldRegions(
  value: string,
  language: TxCodeEditorLanguage,
): readonly TxCodeEditorFoldRegion[] {
  if (!value.trim() || !BRACE_LANGUAGES.has(language)) {
    return [];
  }

  const pairs = language === 'json' ? findJsonBracePairs(value) : findGenericBracePairs(value);
  const regions: TxCodeEditorFoldRegion[] = [];

  for (const pair of pairs) {
    const startLine = lineIndexAt(value, pair.openIndex);
    const endLine = lineIndexAt(value, pair.closeIndex);
    if (endLine <= startLine) {
      continue;
    }
    regions.push({
      id: `fold-${startLine}-${endLine}`,
      startLine,
      endLine,
    });
  }

  return regions;
}

/** Returns regions collapsed in `value` (placeholder line present). */
export function findCollapsedTxCodeEditorFoldRegions(
  value: string,
  language: TxCodeEditorLanguage,
): readonly TxCodeEditorFoldRegion[] {
  return findTxCodeEditorFoldRegions(value, language).filter((region) =>
    isRegionCollapsed(value, region),
  );
}

export function isRegionCollapsed(value: string, region: TxCodeEditorFoldRegion): boolean {
  const lines = value.split('\n');
  return isFoldPlaceholderLine(lines[region.startLine + 1]);
}

/** Returns whether a display line is the folded-block ellipsis placeholder. */
export function isTxCodeEditorFoldPlaceholderLine(line: string | undefined): boolean {
  return (line?.trim() ?? '') === FOLD_PLACEHOLDER;
}

function isFoldPlaceholderLine(line: string | undefined): boolean {
  return isTxCodeEditorFoldPlaceholderLine(line);
}

/**
 * Resolves which collapsed fold region owns the `...` placeholder at a display line index.
 */
export function findCollapsedFoldRegionAtPlaceholderLine(
  display: string,
  displayLineIndex: number,
  canonical: string,
  collapsedIds: ReadonlySet<string>,
  regions: readonly TxCodeEditorFoldRegion[],
): TxCodeEditorFoldRegion | null {
  const displayLines = display.split('\n');
  if (!isTxCodeEditorFoldPlaceholderLine(displayLines[displayLineIndex])) {
    return null;
  }

  const openerDisplay = displayLines[displayLineIndex - 1] ?? '';
  const canonicalLines = canonical.split('\n');

  for (const region of regions) {
    if (!collapsedIds.has(region.id)) {
      continue;
    }
    const canonicalOpener = canonicalLines[region.startLine] ?? '';
    if (canonicalOpener === openerDisplay) {
      return region;
    }
  }

  return null;
}

/**
 * Collapses a region by replacing interior lines with an indented `...` placeholder.
 */
export function collapseTxCodeEditorFoldRegion(
  value: string,
  region: TxCodeEditorFoldRegion,
): { readonly collapsed: string; readonly hidden: string } | null {
  if (isRegionCollapsed(value, region)) {
    return null;
  }
  const lines = value.split('\n');
  if (region.endLine >= lines.length || region.startLine < 0) {
    return null;
  }
  const opener = lines[region.startLine] ?? '';
  const indentMatch = opener.match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? '';
  const hiddenLines = lines.slice(region.startLine + 1, region.endLine);
  if (hiddenLines.length === 0) {
    return null;
  }
  const hidden = hiddenLines.join('\n');
  const placeholder = `${indent}${FOLD_PLACEHOLDER}`;
  const nextLines = [
    ...lines.slice(0, region.startLine + 1),
    placeholder,
    ...lines.slice(region.endLine),
  ];
  return { collapsed: nextLines.join('\n'), hidden };
}

/**
 * Restores hidden lines for a collapsed region.
 */
export function expandTxCodeEditorFoldRegion(
  value: string,
  region: TxCodeEditorFoldRegion,
  hidden: string,
): string | null {
  if (!isRegionCollapsed(value, region)) {
    return null;
  }
  const lines = value.split('\n');
  const nextLines = [
    ...lines.slice(0, region.startLine + 1),
    ...hidden.split('\n'),
    ...lines.slice(region.startLine + 2),
  ];
  return nextLines.join('\n');
}

/**
 * Builds a display string by applying collapsed regions (canonical line indices) to full text.
 */
export function buildTxCodeEditorFoldedDisplay(
  canonical: string,
  collapsedIds: ReadonlySet<string>,
  regions: readonly TxCodeEditorFoldRegion[],
): string {
  if (collapsedIds.size === 0) {
    return canonical;
  }

  const lines = canonical.split('\n');
  const collapsed = regions
    .filter((region) => collapsedIds.has(region.id))
    .sort((a, b) => b.startLine - a.startLine);

  for (const region of collapsed) {
    if (region.endLine >= lines.length || region.startLine < 0) {
      continue;
    }
    const opener = lines[region.startLine] ?? '';
    const indent = opener.match(/^(\s*)/)?.[1] ?? '';
    const placeholder = `${indent}${FOLD_PLACEHOLDER}`;
    lines.splice(region.startLine + 1, region.endLine - region.startLine - 1, placeholder);
  }

  return lines.join('\n');
}

/** Expands every collapsed region using stored hidden text (falls back to no-op when unknown). */
export function expandAllTxCodeEditorFolds(
  value: string,
  hiddenById: ReadonlyMap<string, string>,
  _language: TxCodeEditorLanguage,
): string {
  let next = value;
  const entries = [...hiddenById.entries()].sort((a, b) => {
    const lineA = foldStartLineFromId(a[0]) ?? 0;
    const lineB = foldStartLineFromId(b[0]) ?? 0;
    return lineB - lineA;
  });

  for (const [id, hidden] of entries) {
    const startLine = foldStartLineFromId(id);
    if (startLine === null) {
      continue;
    }
    const region: TxCodeEditorFoldRegion = {
      id,
      startLine,
      endLine: startLine + 2,
    };
    const expanded = expandTxCodeEditorFoldRegion(next, region, hidden);
    if (expanded) {
      next = expanded;
    }
  }

  return next;
}

function foldStartLineFromId(id: string): number | null {
  const match = /^fold-(\d+)-/.exec(id);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

/** Extracts interior lines for a region from canonical (unfolded) text. */
export function extractTxCodeEditorFoldHidden(
  canonical: string,
  region: TxCodeEditorFoldRegion,
): string | null {
  const lines = canonical.split('\n');
  if (region.endLine >= lines.length || region.startLine < 0) {
    return null;
  }
  const hiddenLines = lines.slice(region.startLine + 1, region.endLine);
  if (hiddenLines.length === 0) {
    return null;
  }
  return hiddenLines.join('\n');
}

interface BracePair {
  readonly openIndex: number;
  readonly closeIndex: number;
}

function findJsonBracePairs(value: string): BracePair[] {
  const pairs: BracePair[] = [];
  const stack: { readonly ch: '{' | '['; readonly index: number }[] = [];

  let i = 0;
  while (i < value.length) {
    if (value[i] === '"') {
      i = skipJsonString(value, i);
      continue;
    }
    const ch = value[i];
    if (ch === '{' || ch === '[') {
      stack.push({ ch, index: i });
    } else if (ch === '}' && stack.length > 0 && stack[stack.length - 1]!.ch === '{') {
      const open = stack.pop()!;
      pairs.push({ openIndex: open.index, closeIndex: i });
    } else if (ch === ']' && stack.length > 0 && stack[stack.length - 1]!.ch === '[') {
      const open = stack.pop()!;
      pairs.push({ openIndex: open.index, closeIndex: i });
    }
    i++;
  }

  return pairs;
}

function findGenericBracePairs(value: string): BracePair[] {
  const pairs: BracePair[] = [];
  const stack: { readonly ch: string; readonly index: number }[] = [];
  const openers = new Set(['{', '[', '(']);
  const closers: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

  let i = 0;
  while (i < value.length) {
    const ch = value[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipQuotedString(value, i, ch);
      continue;
    }
    if (ch === '/' && value[i + 1] === '/') {
      const nl = value.indexOf('\n', i);
      i = nl === -1 ? value.length : nl + 1;
      continue;
    }
    if (openers.has(ch)) {
      stack.push({ ch, index: i });
    } else if (ch in closers && stack.length > 0 && stack[stack.length - 1]!.ch === closers[ch]!) {
      const open = stack.pop()!;
      if (ch === '{' || ch === '[') {
        pairs.push({ openIndex: open.index, closeIndex: i });
      }
    }
    i++;
  }

  return pairs;
}

function lineIndexAt(value: string, index: number): number {
  return value.slice(0, index).split('\n').length - 1;
}

/** Maps a textarea pointer Y coordinate to a 0-based line index. */
export function txCodeEditorLineIndexAtClientY(ta: HTMLTextAreaElement, clientY: number): number {
  const style = getComputedStyle(ta);
  const lineHeight = parseFloat(style.lineHeight);
  const fontSize = parseFloat(style.fontSize);
  const resolvedLineHeight = Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.5;
  const padTop = parseFloat(style.paddingTop) || 0;
  const rect = ta.getBoundingClientRect();
  const y = clientY - rect.top - padTop + ta.scrollTop;
  return Math.max(0, Math.floor(y / resolvedLineHeight));
}

function skipJsonString(value: string, start: number): number {
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === '"') {
      return i + 1;
    }
    i++;
  }
  return value.length;
}

function skipQuotedString(value: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < value.length) {
    if (value[i] === '\\') {
      i += 2;
      continue;
    }
    if (value[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return value.length;
}

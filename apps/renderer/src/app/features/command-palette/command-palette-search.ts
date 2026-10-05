export interface PaletteSearchable {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly keywords?: string;
}

export type PaletteHomeSectionId = 'pinned' | 'this-tab' | 'workspace' | 'go-to' | 'preferences';

export interface PaletteHomeSection {
  readonly id: PaletteHomeSectionId;
  readonly label: string;
}

export const PALETTE_HOME_SECTIONS: readonly PaletteHomeSection[] = [
  { id: 'pinned', label: 'Pinned' },
  { id: 'this-tab', label: 'This tab' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'go-to', label: 'Go to' },
  { id: 'preferences', label: 'Preferences' },
];

export type PaletteHomeRow<T extends PaletteSearchable> =
  | { readonly kind: 'header'; readonly id: string; readonly label: string }
  | { readonly kind: 'command'; readonly command: T };

/**
 * Groups palette commands into contextual home sections when the query is empty.
 */
export function buildPaletteHomeRows<T extends PaletteSearchable & { readonly homeSection?: PaletteHomeSectionId }>(
  commands: readonly T[],
): readonly PaletteHomeRow<T>[] {
  const bySection = new Map<PaletteHomeSectionId, T[]>();
  for (const section of PALETTE_HOME_SECTIONS)
    bySection.set(section.id, []);
  for (const command of commands) {
    const section = command.homeSection ?? 'go-to';
    bySection.get(section)?.push(command);
  }
  const rows: PaletteHomeRow<T>[] = [];
  for (const section of PALETTE_HOME_SECTIONS) {
    const items = bySection.get(section.id) ?? [];
    if (items.length === 0)
      continue;
    rows.push({ kind: 'header', id: `section-${section.id}`, label: section.label });
    for (const command of items)
      rows.push({ kind: 'command', command });
  }
  return rows;
}

/**
 * Scores how well a palette command matches the query. Higher is better; 0 means no match.
 */
export function scorePaletteMatch(query: string, item: PaletteSearchable): number {
  const needle = query.trim().toLowerCase();
  if (!needle)
    return 1;

  const label = item.label.toLowerCase();
  const hint = item.hint.toLowerCase();
  const keywords = (item.keywords ?? '').toLowerCase();
  const haystack = `${label} ${hint} ${keywords}`;

  if (label === needle)
    return 1_000;
  if (label.startsWith(needle))
    return 900 + Math.max(0, 40 - label.length);
  if (wordStartsWith(label, needle))
    return 850;
  if (label.includes(needle))
    return 800;

  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => wordStartsWith(haystack, token) || haystack.includes(token)))
    return 720;

  if (haystack.includes(needle))
    return 600;
  if (tokens.every((token) => haystack.includes(token)))
    return 550;

  const labelFuzzy = fuzzySubsequenceScore(label, needle);
  if (labelFuzzy > 0)
    return 300 + labelFuzzy;

  const hayFuzzy = fuzzySubsequenceScore(haystack, needle);
  if (hayFuzzy > 0)
    return 100 + hayFuzzy;

  return 0;
}

/**
 * Filters and ranks searchable commands for the query.
 */
export function rankPaletteCommands<T extends PaletteSearchable>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const needle = query.trim();
  if (!needle)
    return items;

  return items
    .map((item) => ({ item, score: scorePaletteMatch(needle, item) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score)
        return right.score - left.score;
      return left.item.label.localeCompare(right.item.label);
    })
    .map((entry) => entry.item);
}

function wordStartsWith(text: string, needle: string): boolean {
  if (text.startsWith(needle))
    return true;
  const parts = text.split(/[\s/_.:·\-—]+/);
  return parts.some((part) => part.startsWith(needle));
}

/**
 * Contiguous-friendly subsequence score used for typo-tolerant palette matching.
 */
function fuzzySubsequenceScore(text: string, query: string): number {
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (let index = 0; index < query.length; index += 1) {
    const ch = query[index];
    if (!ch)
      return 0;
    const found = text.indexOf(ch, cursor);
    if (found < 0)
      return 0;
    if (found === cursor)
      streak += 1;
    else
      streak = 0;
    score += 1 + streak * 2;
    if (found === 0 || isBoundary(text[found - 1] ?? ''))
      score += 6;
    cursor = found + 1;
  }
  score += Math.max(0, 48 - text.length);
  return score;
}

function isBoundary(ch: string): boolean {
  return ch === ' ' || ch === '-' || ch === '_' || ch === '/' || ch === '.';
}

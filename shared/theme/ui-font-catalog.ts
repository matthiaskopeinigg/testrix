/**
 * UI font catalog — SIL/Open Font License families served via Google Fonts.
 * Mono stack (`--tx-font-mono`) is unchanged; these apply to body and headings.
 */

export const UI_FONT_IDS = [
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'montserrat',
  'poppins',
  'nunito',
  'source-sans-3',
  'work-sans',
  'rubik',
  'dm-sans',
  'ibm-plex-sans',
  'noto-sans',
  'manrope',
  'figtree',
] as const;

export type UiFontId = (typeof UI_FONT_IDS)[number];

export const DEFAULT_UI_FONT_ID: UiFontId = 'inter';

export interface UiFontDefinition {
  readonly id: UiFontId;
  readonly label: string;
  /** Primary family name for `font-family` (quoted when needed). */
  readonly family: string;
  /** Google Fonts CSS2 family token (spaces as `+` in URL). */
  readonly googleFamily: string;
}

export const UI_FONT_CATALOG: readonly UiFontDefinition[] = [
  { id: 'inter', label: 'Inter', family: 'Inter', googleFamily: 'Inter' },
  { id: 'roboto', label: 'Roboto', family: 'Roboto', googleFamily: 'Roboto' },
  { id: 'open-sans', label: 'Open Sans', family: 'Open Sans', googleFamily: 'Open+Sans' },
  { id: 'lato', label: 'Lato', family: 'Lato', googleFamily: 'Lato' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat', googleFamily: 'Montserrat' },
  { id: 'poppins', label: 'Poppins', family: 'Poppins', googleFamily: 'Poppins' },
  { id: 'nunito', label: 'Nunito', family: 'Nunito', googleFamily: 'Nunito' },
  { id: 'source-sans-3', label: 'Source Sans 3', family: 'Source Sans 3', googleFamily: 'Source+Sans+3' },
  { id: 'work-sans', label: 'Work Sans', family: 'Work Sans', googleFamily: 'Work+Sans' },
  { id: 'rubik', label: 'Rubik', family: 'Rubik', googleFamily: 'Rubik' },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans', googleFamily: 'DM+Sans' },
  {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    family: 'IBM Plex Sans',
    googleFamily: 'IBM+Plex+Sans',
  },
  { id: 'noto-sans', label: 'Noto Sans', family: 'Noto Sans', googleFamily: 'Noto+Sans' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', googleFamily: 'Manrope' },
  { id: 'figtree', label: 'Figtree', family: 'Figtree', googleFamily: 'Figtree' },
] as const;

const UI_FONT_BY_ID = new Map<UiFontId, UiFontDefinition>(
  UI_FONT_CATALOG.map((entry) => [entry.id, entry]),
);

/** Returns true when `value` is a known persisted UI font id. */
export function isUiFontId(value: unknown): value is UiFontId {
  return typeof value === 'string' && UI_FONT_BY_ID.has(value as UiFontId);
}

/** Resolves a font id to its catalog entry, falling back to the default. */
export function getUiFontDefinition(id: UiFontId): UiFontDefinition {
  return UI_FONT_BY_ID.get(id) ?? UI_FONT_BY_ID.get(DEFAULT_UI_FONT_ID)!;
}

/** CSS `font-family` stack for UI chrome and copy. */
export function uiFontFamilyStack(id: UiFontId): string {
  const family = getUiFontDefinition(id).family;
  const quoted = family.includes(' ') ? `'${family}'` : family;
  return `${quoted}, system-ui, -apple-system, 'Segoe UI', sans-serif`;
}

/** Google Fonts CSS2 URL for the given UI font (weights 400–700). */
export function buildUiFontStylesheetUrl(id: UiFontId): string {
  const { googleFamily } = getUiFontDefinition(id);
  return `https://fonts.googleapis.com/css2?family=${googleFamily}:wght@400;500;600;700&display=swap`;
}

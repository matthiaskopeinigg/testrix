/**
 * Interface typography scale (appearance settings).
 */

export const UI_FONT_SIZE_IDS = ['small', 'medium', 'large'] as const;
export type UiFontSizeId = (typeof UI_FONT_SIZE_IDS)[number];
export const DEFAULT_UI_FONT_SIZE_ID: UiFontSizeId = 'medium';

export const UI_FONT_WEIGHT_IDS = ['regular', 'medium', 'semibold', 'bold'] as const;
export type UiFontWeightId = (typeof UI_FONT_WEIGHT_IDS)[number];
export const DEFAULT_UI_FONT_WEIGHT_ID: UiFontWeightId = 'regular';

export const UI_LINE_HEIGHT_IDS = ['compact', 'normal', 'relaxed'] as const;
export type UiLineHeightId = (typeof UI_LINE_HEIGHT_IDS)[number];
export const DEFAULT_UI_LINE_HEIGHT_ID: UiLineHeightId = 'normal';

export interface UiTypographyOption {
  readonly id: string;
  readonly label: string;
}

export const UI_FONT_SIZE_OPTIONS: readonly UiTypographyOption[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
] as const;

export const UI_FONT_WEIGHT_OPTIONS: readonly UiTypographyOption[] = [
  { id: 'regular', label: 'Regular' },
  { id: 'medium', label: 'Medium' },
  { id: 'semibold', label: 'Semibold' },
  { id: 'bold', label: 'Bold' },
] as const;

export const UI_LINE_HEIGHT_OPTIONS: readonly UiTypographyOption[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Normal' },
  { id: 'relaxed', label: 'Relaxed' },
] as const;

export interface UiTypographyTokens {
  readonly rootFontSize: string;
  readonly bodyWeight: string;
  readonly headingWeight: string;
  readonly lineHeight: string;
}

const SIZE_TOKENS: Record<UiFontSizeId, UiTypographyTokens['rootFontSize']> = {
  small: '14px',
  medium: '16px',
  large: '17.5px',
};

const WEIGHT_TOKENS: Record<UiFontWeightId, { body: string; heading: string }> = {
  regular: { body: '400', heading: '600' },
  medium: { body: '500', heading: '600' },
  semibold: { body: '600', heading: '700' },
  bold: { body: '700', heading: '800' },
};

const LINE_HEIGHT_TOKENS: Record<UiLineHeightId, string> = {
  compact: '1.35',
  normal: '1.5',
  relaxed: '1.65',
};

export function isUiFontSizeId(value: unknown): value is UiFontSizeId {
  return typeof value === 'string' && UI_FONT_SIZE_IDS.includes(value as UiFontSizeId);
}

export function isUiFontWeightId(value: unknown): value is UiFontWeightId {
  return typeof value === 'string' && UI_FONT_WEIGHT_IDS.includes(value as UiFontWeightId);
}

export function isUiLineHeightId(value: unknown): value is UiLineHeightId {
  return typeof value === 'string' && UI_LINE_HEIGHT_IDS.includes(value as UiLineHeightId);
}

/** Resolved CSS values for `document.documentElement` custom properties. */
export function resolveUiTypographyTokens(
  sizeId: UiFontSizeId,
  weightId: UiFontWeightId,
  lineHeightId: UiLineHeightId,
): UiTypographyTokens {
  const weights = WEIGHT_TOKENS[weightId] ?? WEIGHT_TOKENS[DEFAULT_UI_FONT_WEIGHT_ID];
  return {
    rootFontSize: SIZE_TOKENS[sizeId] ?? SIZE_TOKENS[DEFAULT_UI_FONT_SIZE_ID],
    bodyWeight: weights.body,
    headingWeight: weights.heading,
    lineHeight: LINE_HEIGHT_TOKENS[lineHeightId] ?? LINE_HEIGHT_TOKENS[DEFAULT_UI_LINE_HEIGHT_ID],
  };
}

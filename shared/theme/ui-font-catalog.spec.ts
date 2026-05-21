import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UI_FONT_ID,
  UI_FONT_IDS,
  buildUiFontStylesheetUrl,
  getUiFontDefinition,
  isUiFontId,
  uiFontFamilyStack,
} from './ui-font-catalog';

describe('ui-font-catalog', () => {
  it('defines 15 UI fonts with inter as default', () => {
    expect(UI_FONT_IDS).toHaveLength(15);
    expect(DEFAULT_UI_FONT_ID).toBe('inter');
  });

  it('resolves family stacks and Google Fonts URLs', () => {
    expect(uiFontFamilyStack('inter')).toContain('Inter');
    expect(uiFontFamilyStack('open-sans')).toContain("'Open Sans'");
    expect(buildUiFontStylesheetUrl('ibm-plex-sans')).toContain('IBM+Plex+Sans');
  });

  it('guards unknown ids', () => {
    expect(isUiFontId('comic-sans')).toBe(false);
    expect(getUiFontDefinition('unknown' as 'inter').id).toBe('inter');
  });
});

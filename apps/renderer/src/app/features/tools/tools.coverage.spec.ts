import { describe, expect, it } from 'vitest';

import { TOOL_IDS } from '@testrix/contracts';

import { articlesForSection, filterHelpHits } from '../help/help-registry';

const TOOL_ARTICLE_IDS = [
  'tools-uuid',
  'tools-base64',
  'tools-jwt',
  'tools-cron',
  'tools-url',
  'tools-regex',
  'tools-password',
  'tools-plantuml',
] as const;

/**
 * Documentation / product coverage for the Tools rail and editors.
 */
describe('Tools coverage', () => {
  it('covers every tool article for the Tools section', () => {
    const articles = articlesForSection('tools');
    for (const id of TOOL_ARTICLE_IDS)
      expect(articles.some((item) => item.id === id)).toBe(true);
    expect(TOOL_IDS).toHaveLength(TOOL_ARTICLE_IDS.length);
  });

  it('covers sidebar drag order and UUID clipboard tips', () => {
    expect(filterHelpHits('Drag tools').some((item) => item.id === 'tools-uuid')).toBe(true);
    expect(filterHelpHits('Generate & copy').some((item) => item.id === 'tools-uuid')).toBe(true);
  });

  it('covers Base64 URL-safe, JWT HS256, and cron next runs', () => {
    expect(filterHelpHits('URL-safe').some((item) => item.id === 'tools-base64')).toBe(true);
    expect(filterHelpHits('HS256').some((item) => item.id === 'tools-jwt')).toBe(true);
    expect(filterHelpHits('next five').some((item) => item.id === 'tools-cron')).toBe(true);
  });

  it('covers URL modes, regex flags, and crypto password generation', () => {
    expect(filterHelpHits('encodeURIComponent').some((item) => item.id === 'tools-url')).toBe(true);
    expect(filterHelpHits('capture groups').some((item) => item.id === 'tools-regex')).toBe(true);
    expect(filterHelpHits('crypto.getRandomValues').some((item) => item.id === 'tools-password')).toBe(true);
  });

  it('covers PlantUML tree, save, and offline SVG preview', () => {
    expect(filterHelpHits('PlantUML').some((item) => item.id === 'tools-plantuml')).toBe(true);
    expect(filterHelpHits('plantuml.json').some((item) => item.id === 'tools-plantuml')).toBe(true);
    expect(filterHelpHits('Download SVG').some((item) => item.id === 'tools-plantuml')).toBe(true);
  });

});
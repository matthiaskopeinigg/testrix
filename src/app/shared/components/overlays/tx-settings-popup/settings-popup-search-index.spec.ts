import { describe, expect, it } from 'vitest';

import { settingsSectionMatchesQuery } from './settings-popup-search-index';

describe('settingsSectionMatchesQuery', () => {
  it('matches indexed option labels within a section', () => {
    expect(settingsSectionMatchesQuery('httpRequest', 'timeout')).toBe(true);
    expect(settingsSectionMatchesQuery('appearance', 'dracula')).toBe(true);
    expect(settingsSectionMatchesQuery('logging', 'trace')).toBe(true);
    expect(settingsSectionMatchesQuery('databases', 'postgresql')).toBe(true);
  });

  it('does not match unrelated sections', () => {
    expect(settingsSectionMatchesQuery('regression', 'timeout')).toBe(false);
    expect(settingsSectionMatchesQuery('about', 'dracula')).toBe(false);
  });

  it('matches editor layout terms in workspace tab sections', () => {
    expect(settingsSectionMatchesQuery('regression', 'editor layout')).toBe(true);
    expect(settingsSectionMatchesQuery('capture', 'sidebar')).toBe(true);
  });

  it('treats an empty query as matching every section', () => {
    expect(settingsSectionMatchesQuery('httpRequest', '')).toBe(true);
    expect(settingsSectionMatchesQuery('httpRequest', '   ')).toBe(true);
  });
});

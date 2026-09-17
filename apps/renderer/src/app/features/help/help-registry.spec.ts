import { describe, expect, it } from 'vitest';

import { articlesForSection, filterHelpHits } from './help-registry';

describe('filterHelpHits', () => {
  it('returns nothing for an empty query', () => {
    expect(filterHelpHits('   ')).toEqual([]);
  });

  it('matches proxy topics', () => {
    const hits = filterHelpHits('proxy');
    expect(hits.some((item) => item.section === 'network')).toBe(true);
  });
});

describe('articlesForSection', () => {
  it('returns getting started articles', () => {
    expect(articlesForSection('start').length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';

import { articlesForSection, filterHelpHits } from '../help/help-registry';

/**
 * Documentation / product coverage for Environments rail and editor.
 */
describe('Environments coverage', () => {
  it('covers the environments variables article', () => {
    expect(articlesForSection('environments').some((item) => item.id === 'environments-vars')).toBe(true);
  });

  it('covers titlebar picker, None, and Duplicate', () => {
    expect(filterHelpHits('titlebar environment picker').some((item) => item.id === 'environments-vars')).toBe(
      true,
    );
    expect(filterHelpHits('None').some((item) => item.id === 'environments-vars')).toBe(true);
    expect(filterHelpHits('Duplicate').some((item) => item.id === 'environments-vars')).toBe(true);
  });

  it('covers secrets and rename tips', () => {
    expect(filterHelpHits('secrets').some((item) => item.id === 'environments-vars')).toBe(true);
    expect(filterHelpHits('Rename').some((item) => item.id === 'environments-vars')).toBe(true);
  });
});

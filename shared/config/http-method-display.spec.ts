import { describe, expect, it } from 'vitest';

import {
  coerceHttpMethodDisplay,
  httpMethodShowsInTab,
  httpMethodShowsInTree,
} from './http-method-display';

describe('httpMethodDisplay', () => {
  it('coerces unknown values to tree-and-tab', () => {
    expect(coerceHttpMethodDisplay('invalid')).toBe('tree-and-tab');
  });

  it('resolves tree visibility', () => {
    expect(httpMethodShowsInTree('tree-and-tab')).toBe(true);
    expect(httpMethodShowsInTree('tree')).toBe(true);
    expect(httpMethodShowsInTree('tab')).toBe(false);
    expect(httpMethodShowsInTree('never')).toBe(false);
  });

  it('resolves tab visibility', () => {
    expect(httpMethodShowsInTab('tree-and-tab')).toBe(true);
    expect(httpMethodShowsInTab('tab')).toBe(true);
    expect(httpMethodShowsInTab('tree')).toBe(false);
    expect(httpMethodShowsInTab('never')).toBe(false);
  });
});

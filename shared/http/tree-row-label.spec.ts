import { describe, expect, it } from 'vitest';

import {
  stripHttpMethodPrefixFromLabel,
  treeRowLabelWithHttpMethod,
} from './tree-row-label';

describe('tree-row-label', () => {
  it('strips a leading method prefix', () => {
    expect(stripHttpMethodPrefixFromLabel('POST', 'POST https://api.example.com/v1')).toBe(
      'https://api.example.com/v1',
    );
  });

  it('returns empty when label is only the method', () => {
    expect(stripHttpMethodPrefixFromLabel('GET', 'GET')).toBe('');
  });

  it('uses fallback when stripped label is empty', () => {
    expect(treeRowLabelWithHttpMethod('GET', 'GET')).toBe('Request');
    expect(treeRowLabelWithHttpMethod('POST', 'POST https://x.test')).toBe('https://x.test');
  });
});

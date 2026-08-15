import { describe, expect, it } from 'vitest';

import {
  loadTestEnvironmentIdOverride,
  loadTestEnvironmentSummary,
  loadTestManualEnvironmentId,
  resolveLoadTestEffectiveEnvironmentId,
} from './resolve-load-test-environment';

describe('resolveLoadTestEffectiveEnvironmentId', () => {
  it('forces none when the load test environment id is empty', () => {
    expect(resolveLoadTestEffectiveEnvironmentId('', 'env-req')).toBeNull();
  });

  it('overrides an inherited collection environment', () => {
    expect(resolveLoadTestEffectiveEnvironmentId('env-lt', 'env-req')).toBe('env-lt');
  });

  it('inherits the collection request environment when unset', () => {
    expect(resolveLoadTestEffectiveEnvironmentId(null, 'env-req')).toBe('env-req');
    expect(resolveLoadTestEffectiveEnvironmentId(undefined, null)).toBeNull();
  });
});

describe('loadTestEnvironmentIdOverride', () => {
  it('omits an override when inheriting', () => {
    expect(loadTestEnvironmentIdOverride(null)).toBeUndefined();
    expect(loadTestEnvironmentIdOverride(undefined)).toBeUndefined();
  });

  it('passes empty string and explicit ids through', () => {
    expect(loadTestEnvironmentIdOverride('')).toBe('');
    expect(loadTestEnvironmentIdOverride('env-a')).toBe('env-a');
  });
});

describe('loadTestManualEnvironmentId', () => {
  it('treats inherit and none as no environment', () => {
    expect(loadTestManualEnvironmentId(null)).toBeNull();
    expect(loadTestManualEnvironmentId('')).toBeNull();
  });

  it('returns an explicit profile id', () => {
    expect(loadTestManualEnvironmentId('env-a')).toBe('env-a');
  });
});

describe('loadTestEnvironmentSummary', () => {
  it('describes inherit, none, and named profiles', () => {
    expect(
      loadTestEnvironmentSummary({ environmentId: null, targetSource: 'collection' }),
    ).toBe('Inherit from request');
    expect(
      loadTestEnvironmentSummary({ environmentId: null, targetSource: 'manual' }),
    ).toBe('No environment');
    expect(
      loadTestEnvironmentSummary({ environmentId: '', targetSource: 'collection' }),
    ).toBe('No environment');
    expect(
      loadTestEnvironmentSummary({
        environmentId: 'e1',
        targetSource: 'collection',
        environmentName: 'Prod',
      }),
    ).toBe('Prod');
  });
});

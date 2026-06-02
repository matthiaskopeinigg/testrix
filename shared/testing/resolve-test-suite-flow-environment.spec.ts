import { describe, expect, it } from 'vitest';

import { resolveTestSuiteFlowEnvironmentId } from './resolve-test-suite-flow-environment';

describe('resolveTestSuiteFlowEnvironmentId', () => {
  it('prefers an explicit flow environment when set', () => {
    expect(
      resolveTestSuiteFlowEnvironmentId('flow-env', [{ environmentId: 'folder-env' }]),
    ).toBe('flow-env');
  });

  it('inherits from the nearest ancestor folder when the flow has none', () => {
    expect(
      resolveTestSuiteFlowEnvironmentId(null, [
        { environmentId: 'root-env' },
        { environmentId: 'child-env' },
      ]),
    ).toBe('child-env');
  });

  it('forces no environment when the flow uses an empty string', () => {
    expect(
      resolveTestSuiteFlowEnvironmentId('', [{ environmentId: 'folder-env' }]),
    ).toBeNull();
  });

  it('returns null when nothing is configured', () => {
    expect(resolveTestSuiteFlowEnvironmentId(null, [])).toBeNull();
    expect(resolveTestSuiteFlowEnvironmentId(null, [{ environmentId: null }])).toBeNull();
  });
});

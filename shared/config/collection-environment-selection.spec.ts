import { describe, expect, it } from 'vitest';

import {
  COLLECTION_ENVIRONMENT_INHERIT,
  COLLECTION_ENVIRONMENT_NONE,
  buildCollectionEnvironmentDropdownOptions,
  environmentIdFromDropdownValue,
  toEnvironmentDropdownValue,
} from './collection-environment-selection';

describe('collection-environment-selection', () => {
  it('maps inherit, none, and explicit ids for dropdown and persistence', () => {
    expect(toEnvironmentDropdownValue(null)).toBe(COLLECTION_ENVIRONMENT_INHERIT);
    expect(toEnvironmentDropdownValue(undefined)).toBe(COLLECTION_ENVIRONMENT_INHERIT);
    expect(toEnvironmentDropdownValue('')).toBe(COLLECTION_ENVIRONMENT_NONE);
    expect(toEnvironmentDropdownValue('env-a')).toBe('env-a');

    expect(environmentIdFromDropdownValue(COLLECTION_ENVIRONMENT_INHERIT)).toBeNull();
    expect(environmentIdFromDropdownValue('')).toBeNull();
    expect(environmentIdFromDropdownValue(COLLECTION_ENVIRONMENT_NONE)).toBe('');
    expect(environmentIdFromDropdownValue('env-a')).toBe('env-a');
  });

  it('builds inherit option by default', () => {
    const options = buildCollectionEnvironmentDropdownOptions([{ id: 'e1', name: 'Dev' }]);
    expect(options[0]).toEqual({
      value: COLLECTION_ENVIRONMENT_INHERIT,
      label: 'Inherit from folder',
    });
    expect(options[1].value).toBe(COLLECTION_ENVIRONMENT_NONE);
    expect(options[2]).toEqual({ value: 'e1', label: 'Dev' });
  });
});

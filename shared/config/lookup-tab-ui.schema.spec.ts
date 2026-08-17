import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOOKUP_TAB_SECTION,
  coerceLookupTabSectionId,
  lookupTabUiSchema,
  resolveLookupTabUi,
} from './lookup-tab-ui.schema';

describe('lookup-tab-ui.schema', () => {
  it('returns defaults for unknown resource ids', () => {
    expect(resolveLookupTabUi({}, 'lk:missing')).toEqual(
      lookupTabUiSchema.parse({ activeSection: DEFAULT_LOOKUP_TAB_SECTION }),
    );
  });

  it('restores saved section, inputs, and last run', () => {
    const ui = resolveLookupTabUi(
      {
        'lk:a1': {
          activeSection: 'edit',
          runEnvironmentId: 'env-1',
          runInputs: { email: 'ada@example.com' },
          lastRun: {
            ok: true,
            environmentId: 'env-1',
            variables: { uuid: 'u-1' },
            results: [{ id: 'r-uuid', label: 'Profile UUID', value: 'u-1' }],
            stepLog: [
              {
                stepId: 'st-1',
                name: 'Identity',
                status: 'ran',
                message: '1 row',
              },
            ],
          },
          runError: null,
        },
      },
      'lk:a1',
    );

    expect(ui.activeSection).toBe('edit');
    expect(ui.runEnvironmentId).toBe('env-1');
    expect(ui.runInputs).toEqual({ email: 'ada@example.com' });
    expect(ui.lastRun?.results[0]?.value).toBe('u-1');
    expect(ui.runError).toBeNull();
  });

  it('coerces invalid section ids to run', () => {
    expect(coerceLookupTabSectionId('invalid')).toBe('run');
  });
});
